// packages/orchestrator/src/agent/triage-outcome.test.ts
//
// Roadmap Auto-Triage — Phase 4, Task 3: post-diff signal extraction + closed loop.
// SC1 (post-diff signals + classify), SC5 (real PrecedentLookup base-rates), SC7
// (absent prediction ⇒ block-escalate).

import { describe, it, expect } from 'vitest';
import {
  signalsFromDiff,
  layerOfPath,
  runRetrospective,
  buildTriageOutcomeInput,
  precedentLookupFromStored,
} from './triage-outcome.js';
import type { IntroducedHunk } from './quality-verdict.js';
import type { TriagePrediction } from '@harness-engineering/intelligence';

const TEXT_ONLY = { descriptionLength: 120, specExists: true, acceptanceMeasurable: true };

function hunk(file: string, addedLines: number): IntroducedHunk {
  return {
    file,
    addedContent: Array.from({ length: addedLines }, (_, i) => `line ${i}`).join('\n'),
    startLine: 1,
  };
}

function prediction(
  level: TriagePrediction['verdict']['level'],
  scopeEstimate: number
): TriagePrediction {
  return {
    verdict: { level, confidence: 'medium', signals: {}, source: 'static' },
    levers: {},
    scopeEstimate,
    ratchetStage: 2,
  };
}

describe('layerOfPath', () => {
  it('extracts <pkg>/<layer> from the monorepo convention', () => {
    expect(layerOfPath('packages/core/src/roadmap/parse.ts')).toBe('core/roadmap');
  });
  it('falls back to the first directory otherwise', () => {
    expect(layerOfPath('docs/changes/x.md')).toBe('docs');
  });
  it('buckets a root file under <root>', () => {
    expect(layerOfPath('README.md')).toBe('<root>');
  });
});

describe('signalsFromDiff', () => {
  it('SC1: derives filesTouched / layersTouched / blastRadius from the diff', () => {
    const hunks = [
      hunk('packages/core/src/roadmap/a.ts', 10),
      hunk('packages/core/src/roadmap/b.ts', 5),
      hunk('packages/cli/src/commands/c.ts', 3),
    ];
    const s = signalsFromDiff(hunks, TEXT_ONLY);
    expect(s.filesTouched).toBe(3);
    expect(s.layersTouched).toBe(2); // core/roadmap + cli/commands
    expect(s.blastRadius).toBe(18);
    expect(s.specExists).toBe(true);
  });

  it('an empty diff yields zeroed diff-signals (text-only carried through)', () => {
    const s = signalsFromDiff([], TEXT_ONLY);
    expect(s.filesTouched).toBe(0);
    expect(s.layersTouched).toBe(0);
    expect(s.blastRadius).toBe(0);
    expect(s.descriptionLength).toBe(120);
  });
});

describe('runRetrospective', () => {
  it('SC1: classifies the actual diff post-diff and matches a well-predicted small change', async () => {
    const hunks = [hunk('packages/core/src/roadmap/a.ts', 4)];
    const res = await runRetrospective({
      hunks,
      textOnly: TEXT_ONLY,
      prediction: prediction('simple', 5),
      riskHigh: false,
      prompt: 'small change',
    });
    expect(res.actual.level).toBeDefined();
    // Small, well-scoped diff vs a simple/5 prediction → matched, verify.
    expect(res.comparison.action).toBe('verify');
    expect(res.comparison.matched).toBe(true);
  });

  it('SC7: an absent stored prediction ⇒ block-escalate (never a silent pass)', async () => {
    const res = await runRetrospective({
      hunks: [hunk('a.ts', 2)],
      textOnly: TEXT_ONLY,
      prediction: undefined,
      riskHigh: false,
      prompt: 'x',
    });
    expect(res.comparison.matched).toBe(false);
    expect(res.comparison.action).toBe('block-escalate');
  });

  it('a large diff that blows past a tiny predicted scope ⇒ block-escalate', async () => {
    const bigHunks = Array.from({ length: 20 }, (_, i) =>
      hunk(`packages/p${i}/src/layer${i}/f.ts`, 50)
    );
    const res = await runRetrospective({
      hunks: bigHunks,
      textOnly: TEXT_ONLY,
      prediction: prediction('trivial', 1),
      riskHigh: false,
      prompt: 'underscoped',
    });
    expect(res.comparison.matched).toBe(false);
    expect(res.comparison.action).toBe('block-escalate');
  });
});

describe('buildTriageOutcomeInput', () => {
  it('carries the shapeKey through and folds in the comparison', async () => {
    const res = await runRetrospective({
      hunks: [hunk('a.ts', 2)],
      textOnly: TEXT_ONLY,
      prediction: prediction('simple', 5),
      riskHigh: false,
      prompt: 'x',
    });
    const input = buildTriageOutcomeInput('EXT-1', 'k|dispatchable|simple', res);
    expect(input.externalId).toBe('EXT-1');
    expect(input.shapeKey).toBe('k|dispatchable|simple');
    expect(input.matched).toBe(res.comparison.matched);
    expect(input.exceededBy).toBe(res.comparison.exceededBy);
    expect(input.actual).toBe(res.actual);
  });
});

describe('precedentLookupFromStored (SC5 — real base-rates, closes the loop)', () => {
  it('cold-start (no outcome-bearing records) ⇒ unknown for every shape', () => {
    const lookup = precedentLookupFromStored([{ shapeKey: 'k' }]);
    expect(lookup.rateForShape('k')).toEqual({ kind: 'unknown' });
  });

  it('returns a measured rate over recorded outcomes for the shape', () => {
    const records = [
      { shapeKey: 'k', outcome: { matched: true } },
      { shapeKey: 'k', outcome: { matched: true } },
      { shapeKey: 'k', outcome: { matched: false } },
      { shapeKey: 'other', outcome: { matched: false } },
    ];
    const rate = precedentLookupFromStored(records).rateForShape('k');
    expect(rate).toEqual({ kind: 'rate', matched: 2, total: 3, rate: 2 / 3 });
  });

  it('a shape with only ungraded (prediction-only) records stays unknown', () => {
    const lookup = precedentLookupFromStored([{ shapeKey: 'k' }, { shapeKey: 'k' }]);
    expect(lookup.rateForShape('k')).toEqual({ kind: 'unknown' });
  });
});
