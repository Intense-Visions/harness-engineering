import { describe, it, expect } from 'vitest';
import { computeDescriptionCost, inclusionRunIds } from './cost';
import type { InclusionEvent } from './types';

const inclusions: InclusionEvent[] = [
  { entryId: 'a', runId: 'r1', tokensShipped: 100 },
  { entryId: 'a', runId: 'r2', tokensShipped: 120 },
  { entryId: 'a', runId: 'r2', tokensShipped: 80 }, // included twice in r2
  { entryId: 'b', runId: 'r1', tokensShipped: 500 },
];

describe('computeDescriptionCost', () => {
  it('sums tokens and inclusion frequency for the target entry only', () => {
    const cost = computeDescriptionCost('a', inclusions);
    expect(cost.entryId).toBe('a');
    expect(cost.inclusionCount).toBe(3);
    expect(cost.totalTokensShipped).toBe(300);
    expect(cost.meanTokensPerInclusion).toBe(100);
    expect(cost.descriptionLength).toBe(300);
  });

  it('yields a zeroed cost for an entry that was never included (no divide-by-zero)', () => {
    const cost = computeDescriptionCost('never', inclusions);
    expect(cost.inclusionCount).toBe(0);
    expect(cost.totalTokensShipped).toBe(0);
    expect(cost.meanTokensPerInclusion).toBe(0);
    expect(cost.descriptionLength).toBe(0);
  });

  it('handles an empty ledger without throwing', () => {
    expect(() => computeDescriptionCost('a', [])).not.toThrow();
    expect(computeDescriptionCost('a', []).inclusionCount).toBe(0);
  });
});

describe('inclusionRunIds', () => {
  it('returns the distinct runs an entry was present in', () => {
    expect([...inclusionRunIds('a', inclusions)].sort()).toEqual(['r1', 'r2']);
    expect([...inclusionRunIds('b', inclusions)]).toEqual(['r1']);
    expect(inclusionRunIds('never', inclusions).size).toBe(0);
  });
});
