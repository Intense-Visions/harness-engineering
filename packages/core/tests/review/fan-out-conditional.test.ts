import { describe, expect, it } from 'vitest';
import { fanOutConditionalSubagents } from '../../src/review/fan-out';
import type { ContextBundle } from '../../src/review/types';
import type { ConditionalSubagent } from '../../src/review/depth-calibrator';

function bug(filePath: string, content: string): ContextBundle {
  return {
    domain: 'bug',
    changeType: 'feature',
    changedFiles: [
      { path: filePath, content, reason: 'changed', lines: content.split('\n').length },
    ],
    contextFiles: [],
    commitHistory: [],
    diffLines: content.split('\n').length,
    contextLines: 0,
  };
}

describe('fanOutConditionalSubagents', () => {
  it('empty activation set returns no results', async () => {
    const results = await fanOutConditionalSubagents({
      bundles: [bug('src/x.ts', 'const x = 1;')],
      activations: new Set(),
      depth: 'standard',
    });
    expect(results).toEqual([]);
  });

  it('dispatches only the activated subagents', async () => {
    const results = await fanOutConditionalSubagents({
      bundles: [bug('src/Page.tsx', 'await fetch(url);\nsetData(d);')],
      activations: new Set<ConditionalSubagent>(['adversarial']),
      depth: 'standard',
    });
    expect(results.map((r) => r.subagent)).toEqual(['adversarial']);
  });

  it('dispatches all three when all activated', async () => {
    const content = [
      'function load(x: any) {',
      '  return JSON.parse(x);',
      '}',
      'window.addEventListener("click", x);',
    ].join('\n');
    const results = await fanOutConditionalSubagents({
      bundles: [bug('src/Page.tsx', content)],
      activations: new Set<ConditionalSubagent>([
        'adversarial',
        'typescript-strict',
        'frontend-races',
      ]),
      depth: 'deep',
    });
    expect(results.map((r) => r.subagent).sort()).toEqual([
      'adversarial',
      'frontend-races',
      'typescript-strict',
    ]);
    for (const result of results) {
      for (const finding of result.findings) {
        expect(finding.subagent).toBe(result.subagent);
        // every conditional finding must carry confidence per the rubric
        expect(finding.confidence).not.toBeUndefined();
      }
    }
  });

  it('cascade detection only runs at Deep depth', async () => {
    const promiseSrc = 'const p = new Promise((resolve) => resolve(1));';
    const bundle = bug('src/Deferred.ts', promiseSrc);

    const standard = await fanOutConditionalSubagents({
      bundles: [bundle],
      activations: new Set<ConditionalSubagent>(['adversarial']),
      depth: 'standard',
    });
    const deep = await fanOutConditionalSubagents({
      bundles: [bundle],
      activations: new Set<ConditionalSubagent>(['adversarial']),
      depth: 'deep',
    });

    const stdHasCascade = standard[0]!.findings.some((f) =>
      f.title.includes('without a reject parameter')
    );
    const deepHasCascade = deep[0]!.findings.some((f) =>
      f.title.includes('without a reject parameter')
    );

    expect(stdHasCascade).toBe(false);
    expect(deepHasCascade).toBe(true);
  });
});
