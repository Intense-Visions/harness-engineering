import { describe, it, expect } from 'vitest';
import { findMergeCandidates } from './consolidate';
import { DEFAULT_MDL_CONFIG, type KnowledgeEntry } from './types';

// Two near-identical entries: same skill/outcome/root_cause/date/file-refs and
// almost the same prose -> high composite overlap.
const shared =
  '2026-08-31 [skill:autopilot] [outcome:completed] [root_cause:stale-cache] ' +
  'The turbo build reads packages/core/src/index.ts and fails on stale cache. ' +
  'Rebuild before commit. See packages/cli/dist/bin/harness.js.';

const entryA: KnowledgeEntry = { id: 'e-a', tokensPerInclusion: 60, text: shared };
const entryB: KnowledgeEntry = {
  id: 'e-b',
  tokensPerInclusion: 60,
  text: shared + ' Rebuild again if the cache is still stale.',
};
// A completely unrelated entry: different skill/outcome, old date, no shared refs.
const entryC: KnowledgeEntry = {
  id: 'e-c',
  tokensPerInclusion: 40,
  text: '2020-01-01 [skill:design] [outcome:failed] Unrelated content about widget colors and spacing.',
};

describe('findMergeCandidates — acceptance #2: consolidation reduces description length at equal value', () => {
  it('clusters the two overlapping entries and shows the union is cheaper than the sum', () => {
    const candidates = findMergeCandidates([entryA, entryB, entryC], DEFAULT_MDL_CONFIG);
    expect(candidates).toHaveLength(1);
    const [candidate] = candidates;
    expect(candidate!.entryIds).toEqual(['e-a', 'e-b']);
    expect(candidate!.overlapScore).toBeGreaterThanOrEqual(DEFAULT_MDL_CONFIG.overlapThreshold);
    // The union of the two overlapping entries compresses better than keeping both.
    expect(candidate!.unionDescriptionLength).toBeLessThan(candidate!.sumDescriptionLength);
    expect(candidate!.savings).toBe(
      candidate!.sumDescriptionLength - candidate!.unionDescriptionLength
    );
    expect(candidate!.savings).toBeGreaterThan(0);
    expect(candidate!.recommend).toBe(true);
  });

  it('does not cluster the unrelated entry', () => {
    const candidates = findMergeCandidates([entryA, entryB, entryC], DEFAULT_MDL_CONFIG);
    for (const candidate of candidates) {
      expect(candidate.entryIds).not.toContain('e-c');
    }
  });

  it('emits no candidate when nothing overlaps', () => {
    const candidates = findMergeCandidates([entryA, entryC], DEFAULT_MDL_CONFIG);
    expect(candidates).toEqual([]);
  });

  it('skips entries without text (cannot be compared)', () => {
    const noText: KnowledgeEntry = { id: 'e-x', tokensPerInclusion: 10 };
    expect(findMergeCandidates([noText], DEFAULT_MDL_CONFIG)).toEqual([]);
    expect(findMergeCandidates([], DEFAULT_MDL_CONFIG)).toEqual([]);
  });
});
