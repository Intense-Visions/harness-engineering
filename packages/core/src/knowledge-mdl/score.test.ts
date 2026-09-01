import { describe, it, expect } from 'vitest';
import { scoreEntry } from './score';
import {
  DEFAULT_MDL_CONFIG,
  type InclusionEvent,
  type KnowledgeEntry,
  type MdlConfig,
  type RunOutcome,
} from './types';

const config: MdlConfig = {
  ...DEFAULT_MDL_CONFIG,
  minPresentRuns: 3,
  minAbsentRuns: 3,
  minPerCell: 2,
};

// A high-value entry: present runs cost far less than matched absent runs.
const highValue: KnowledgeEntry = { id: 'hv', tokensPerInclusion: 50, text: 'high value entry' };
// A worthless entry: present runs cost the SAME as matched absent runs (no compression),
// so it only taxes context.
const worthless: KnowledgeEntry = { id: 'ww', tokensPerInclusion: 50, text: 'worthless entry' };
// An under-observed entry: only one present run — insufficient evidence.
const underObserved: KnowledgeEntry = { id: 'ins', tokensPerInclusion: 50, text: 'unknown entry' };

const inclusions: InclusionEvent[] = [
  { entryId: 'hv', runId: 'p1', tokensShipped: 50 },
  { entryId: 'hv', runId: 'p2', tokensShipped: 50 },
  { entryId: 'hv', runId: 'p3', tokensShipped: 50 },
  { entryId: 'ww', runId: 'w1', tokensShipped: 50 },
  { entryId: 'ww', runId: 'w2', tokensShipped: 50 },
  { entryId: 'ww', runId: 'w3', tokensShipped: 50 },
  { entryId: 'ins', runId: 'u1', tokensShipped: 50 },
];

const outcomes: RunOutcome[] = [
  // hv stratum: present cheap, absent expensive.
  { runId: 'p1', stratum: 'hv', cost: 100 },
  { runId: 'p2', stratum: 'hv', cost: 110 },
  { runId: 'p3', stratum: 'hv', cost: 120 },
  { runId: 'hva1', stratum: 'hv', cost: 300 },
  { runId: 'hva2', stratum: 'hv', cost: 320 },
  { runId: 'hva3', stratum: 'hv', cost: 310 },
  // ww stratum: present and absent cost the same -> no compression value.
  { runId: 'w1', stratum: 'ww', cost: 300 },
  { runId: 'w2', stratum: 'ww', cost: 300 },
  { runId: 'w3', stratum: 'ww', cost: 300 },
  { runId: 'wwa1', stratum: 'ww', cost: 300 },
  { runId: 'wwa2', stratum: 'ww', cost: 300 },
  { runId: 'wwa3', stratum: 'ww', cost: 300 },
  // ins stratum: one present, some absent -> under-populated present cell.
  { runId: 'u1', stratum: 'ins', cost: 200 },
  { runId: 'ua1', stratum: 'ins', cost: 200 },
  { runId: 'ua2', stratum: 'ins', cost: 200 },
];

describe('scoreEntry — acceptance #1: worthless vs high-value are separated', () => {
  it('keeps the high-value entry (measured net positive)', () => {
    const score = scoreEntry(highValue, inclusions, outcomes, config);
    expect(score.verdict).toBe('keep');
    expect(score.netMdl).not.toBeNull();
    expect(score.netMdl!).toBeGreaterThan(0);
    expect(score.compressionValue.sufficient).toBe(true);
  });

  it('recommends pruning the worthless entry (measured net negative)', () => {
    const score = scoreEntry(worthless, inclusions, outcomes, config);
    expect(score.verdict).toBe('prune');
    expect(score.netMdl).not.toBeNull();
    expect(score.netMdl!).toBeLessThan(0);
  });
});

describe('scoreEntry — acceptance #3: no prune on insufficient evidence', () => {
  it('never prunes an under-observed entry; it is retained by default', () => {
    const score = scoreEntry(underObserved, inclusions, outcomes, config);
    expect(score.verdict).toBe('insufficient-evidence');
    expect(score.verdict).not.toBe('prune');
    expect(score.netMdl).toBeNull();
    expect(score.totalMeasuredValue).toBeNull();
    expect(score.rationale).toMatch(/insufficient/i);
  });

  it('never prunes when a positive-cost entry simply has no matched outcomes', () => {
    const orphan: KnowledgeEntry = { id: 'orphan', tokensPerInclusion: 999, text: 'x' };
    const orphanInclusions: InclusionEvent[] = [
      { entryId: 'orphan', runId: 'z1', tokensShipped: 999 },
    ];
    const score = scoreEntry(orphan, orphanInclusions, [], config);
    expect(score.verdict).toBe('insufficient-evidence');
    expect(score.verdict).not.toBe('prune');
  });
});

describe('scoreEntry — pruneMargin guards against pruning on noise', () => {
  it('keeps a marginally-negative entry when the margin is wide', () => {
    const wideMargin: MdlConfig = { ...config, pruneMargin: 1_000_000 };
    const score = scoreEntry(worthless, inclusions, outcomes, wideMargin);
    expect(score.verdict).toBe('keep');
  });
});
