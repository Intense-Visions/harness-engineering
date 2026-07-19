import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runReviewPipeline, attachGuardianCoverage } from '../../src/review/pipeline-orchestrator';
import { fanOutReview, fanOutConditionalSubagents } from '../../src/review/fan-out';
import type { ContextBundle, DiffInfo, PipelineFlags } from '../../src/review/types';

// Capture the bundles that reach the review agents so we can assert whether the
// advisory guardian diff-coverage context file was threaded into them.
vi.mock('../../src/review/fan-out', () => ({
  fanOutReview: vi.fn(async () => []),
  fanOutConditionalSubagents: vi.fn(async () => []),
}));

const DIFF: DiffInfo = {
  changedFiles: ['src/foo.ts'],
  newFiles: [],
  deletedFiles: [],
  totalDiffLines: 10,
  fileDiffs: new Map([['src/foo.ts', '+const x = 1;']]),
};

// noMechanical skips the mechanical phase so the test stays hermetic (no tool spawn).
const FLAGS: PipelineFlags = { comment: false, ci: false, deep: false, noMechanical: true };

const GUARDIAN_BLOCK = [
  '## Guardian diff-coverage (advisory)',
  '',
  'Guardian diff-coverage: FAIL — 1 record(s), 1 file(s) with uncovered diff lines, worst coverage delta -4.2%.',
  '',
  'Uncovered changed lines:',
  '- src/foo.ts: lines 1, 2',
].join('\n');

function bundlesSeenByAgents(): ContextBundle[] {
  const call = vi.mocked(fanOutReview).mock.calls[0];
  return (call![0] as { bundles: ContextBundle[] }).bundles;
}

function guardianFileOn(bundle: ContextBundle) {
  return bundle.contextFiles.find((f) => f.path === 'harness-guardian-diff-coverage');
}

describe('attachGuardianCoverage (pure)', () => {
  const bundles: ContextBundle[] = [
    {
      domain: 'bug',
      changeType: 'feature',
      changedFiles: [],
      contextFiles: [],
      commitHistory: [],
      diffLines: 1,
      contextLines: 0,
    },
  ];

  it('adds one guardian advisory context file to every bundle', () => {
    const out = attachGuardianCoverage(bundles, GUARDIAN_BLOCK);
    const file = guardianFileOn(out[0]!);
    expect(file).toBeDefined();
    expect(file!.content).toBe(GUARDIAN_BLOCK);
    expect(file!.reason).toBe('convention');
    expect(file!.lines).toBe(GUARDIAN_BLOCK.split('\n').length);
  });

  it('does not mutate the input bundles (pure)', () => {
    attachGuardianCoverage(bundles, GUARDIAN_BLOCK);
    expect(bundles[0]!.contextFiles).toEqual([]);
  });
});

describe('runReviewPipeline guardian wiring', () => {
  beforeEach(() => vi.clearAllMocks());

  it('surfaces the guardian advisory in the context bundles the agents receive', async () => {
    await runReviewPipeline({
      projectRoot: '/tmp/does-not-matter',
      diff: DIFF,
      commitMessage: 'feat: x',
      flags: FLAGS,
      guardianCoverage: GUARDIAN_BLOCK,
    });

    const bundles = bundlesSeenByAgents();
    expect(bundles.length).toBeGreaterThan(0);
    // EVERY bundle carries the guardian advisory as a review input.
    for (const b of bundles) {
      const file = guardianFileOn(b);
      expect(file).toBeDefined();
      expect(file!.content).toContain('Guardian diff-coverage: FAIL');
    }
  });

  it('leaves bundles byte-identical (no guardian file) when guardianCoverage is absent', async () => {
    await runReviewPipeline({
      projectRoot: '/tmp/does-not-matter',
      diff: DIFF,
      commitMessage: 'feat: x',
      flags: FLAGS,
    });

    const bundles = bundlesSeenByAgents();
    expect(bundles.length).toBeGreaterThan(0);
    for (const b of bundles) {
      expect(guardianFileOn(b)).toBeUndefined();
    }
  });
});
