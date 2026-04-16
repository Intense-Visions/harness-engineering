import { describe, it, expect } from 'vitest';
import { splitBundlesByStage, stageDomains, STAGE_DOMAINS } from '../../src/review/two-stage';
import type { ContextBundle, ContextFile, ReviewDomain, Rubric } from '../../src/review/types';

function file(path: string, reason: ContextFile['reason']): ContextFile {
  return { path, content: '', reason, lines: 10 };
}

function bundle(domain: ReviewDomain, overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    domain,
    changeType: 'feature',
    changedFiles: [],
    contextFiles: [],
    commitHistory: [],
    diffLines: 0,
    contextLines: 0,
    ...overrides,
  };
}

const RUBRIC: Rubric = {
  changeType: 'feature',
  items: [
    { id: 'spec-1', category: 'spec', title: 'spec item', mustHave: true, rationale: 'r' },
    { id: 'qual-1', category: 'quality', title: 'q item', mustHave: true, rationale: 'r' },
    { id: 'risk-1', category: 'risk', title: 'r item', mustHave: true, rationale: 'r' },
  ],
  generatedAt: '2026-04-16T00:00:00Z',
  source: 'heuristic',
};

describe('STAGE_DOMAINS / stageDomains()', () => {
  it('maps spec-compliance to compliance + architecture', () => {
    expect(stageDomains('spec-compliance')).toEqual(['compliance', 'architecture']);
  });
  it('maps code-quality to bug + security', () => {
    expect(stageDomains('code-quality')).toEqual(['bug', 'security']);
  });
  it('stages are disjoint', () => {
    const spec = new Set(STAGE_DOMAINS['spec-compliance']);
    for (const d of STAGE_DOMAINS['code-quality']) {
      expect(spec.has(d)).toBe(false);
    }
  });
});

describe('splitBundlesByStage()', () => {
  it('keeps only spec-compliance domains for spec-compliance stage', () => {
    const bundles: ContextBundle[] = [
      bundle('compliance'),
      bundle('architecture'),
      bundle('bug'),
      bundle('security'),
    ];
    const result = splitBundlesByStage(bundles, 'spec-compliance');
    expect(result.map((b) => b.domain)).toEqual(['compliance', 'architecture']);
    expect(result.every((b) => b.stage === 'spec-compliance')).toBe(true);
  });

  it('keeps only code-quality domains for code-quality stage', () => {
    const bundles: ContextBundle[] = [
      bundle('compliance'),
      bundle('architecture'),
      bundle('bug'),
      bundle('security'),
    ];
    const result = splitBundlesByStage(bundles, 'code-quality');
    expect(result.map((b) => b.domain)).toEqual(['bug', 'security']);
    expect(result.every((b) => b.stage === 'code-quality')).toBe(true);
  });

  it('filters rubric to spec items for spec-compliance', () => {
    const input = bundle('compliance', { rubric: RUBRIC });
    const [result] = splitBundlesByStage([input], 'spec-compliance');
    expect(result?.rubric?.items.map((i) => i.id)).toEqual(['spec-1']);
  });

  it('filters rubric to quality+risk items for code-quality', () => {
    const input = bundle('bug', { rubric: RUBRIC });
    const [result] = splitBundlesByStage([input], 'code-quality');
    expect(result?.rubric?.items.map((i) => i.id).sort()).toEqual(['qual-1', 'risk-1']);
  });

  it('strips spec-reason context files from code-quality bundles', () => {
    const input = bundle('bug', {
      contextFiles: [
        file('docs/changes/foo/proposal.md', 'spec'),
        file('src/helpers.ts', 'import'),
      ],
      contextLines: 20,
    });
    const [result] = splitBundlesByStage([input], 'code-quality');
    const paths = result?.contextFiles.map((f) => f.path) ?? [];
    expect(paths).toEqual(['src/helpers.ts']);
    expect(result?.contextLines).toBe(10);
  });

  it('keeps spec-reason context files in spec-compliance bundles', () => {
    const input = bundle('compliance', {
      contextFiles: [
        file('docs/changes/foo/proposal.md', 'spec'),
        file('src/helpers.ts', 'import'),
      ],
      contextLines: 20,
    });
    const [result] = splitBundlesByStage([input], 'spec-compliance');
    const reasons = result?.contextFiles.map((f) => f.reason).sort() ?? [];
    expect(reasons).toEqual(['import', 'spec']);
    expect(result?.contextLines).toBe(20);
  });

  it('does not mutate the input bundles', () => {
    const input = bundle('bug', {
      contextFiles: [file('x.md', 'spec')],
      rubric: RUBRIC,
    });
    const snapshot = JSON.parse(JSON.stringify(input));
    splitBundlesByStage([input], 'code-quality');
    expect(input).toEqual(snapshot);
  });

  it('handles bundles without a rubric', () => {
    const input = bundle('compliance');
    const [result] = splitBundlesByStage([input], 'spec-compliance');
    expect(result?.rubric).toBeUndefined();
    expect(result?.stage).toBe('spec-compliance');
  });
});
