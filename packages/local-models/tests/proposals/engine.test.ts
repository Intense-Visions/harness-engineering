import { describe, it, expect } from 'vitest';
import { diffPoolAgainstRanking } from '../../src/proposals/engine.js';
import type { PoolEntry, PoolState } from '../../src/pool/types.js';
import type { RankedModel } from '../../src/ranker/types.js';

function rm(o: Partial<RankedModel>): RankedModel {
  return {
    hfRepoId: 'Org/Default',
    ollamaName: 'default:latest',
    fitsHardware: true,
    evidence: 'direct',
    benchmarkSnapshot: '2026-05-21',
    estimatedVramGb: 20,
    score: 0,
    ...o,
  } as unknown as RankedModel;
}

function pe(o: Partial<PoolEntry>): PoolEntry {
  return {
    ollamaName: 'entry:latest',
    hfRepoId: 'org/entry',
    sizeOnDiskGb: 10,
    installedAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
    currentScore: 60,
    ...o,
  };
}

function poolOf(entries: PoolEntry[]): PoolState {
  return {
    diskBudgetGb: 100,
    diskUsedGb: entries.reduce((s, e) => s + e.sizeOnDiskGb, 0),
    entries,
    allowedOrgs: [],
    allowedFamilies: [],
    lastRefreshAt: null,
  };
}

describe('diffPoolAgainstRanking (F6: at most one proposal per pool entry)', () => {
  it('emits exactly one proposal per entry that has a viable beat', () => {
    const pool = poolOf([
      pe({ ollamaName: 'old-a', hfRepoId: 'org/A', currentScore: 60 }),
      pe({ ollamaName: 'old-b', hfRepoId: 'org/B', currentScore: 65 }),
    ]);
    const ranked = [
      rm({ ollamaName: 'new-a', hfRepoId: 'Org/NewA', score: 80 }),
      rm({ ollamaName: 'new-a2', hfRepoId: 'Org/NewA2', score: 75 }),
      rm({ ollamaName: 'new-b', hfRepoId: 'Org/NewB', score: 90 }),
    ];
    const out = diffPoolAgainstRanking({ pool, ranked, proposalThreshold: 5, vramGb: 32 });

    // One proposal per entry (F6) — never more.
    expect(out).toHaveLength(2);
    const replaced = out.map((p) => p.replaces?.ollamaName).sort();
    expect(replaced).toEqual(['old-a', 'old-b']);
    // No swap-in target is proposed twice.
    const targets = out.map((p) => p.target.ollamaName);
    expect(new Set(targets).size).toBe(targets.length);
    // Justification is wired from the ranked candidate.
    const p0 = out.find((p) => p.replaces?.ollamaName === 'old-a')!;
    expect(p0.action).toBe('swap');
    expect(p0.justification.summary).toMatch(new RegExp(p0.target.ollamaName));
    expect(p0.scoreDelta).toBeGreaterThanOrEqual(5);
  });

  it('emits nothing when candidates beat by less than the threshold (ties included)', () => {
    const pool = poolOf([pe({ ollamaName: 'old-a', currentScore: 60 })]);
    const ranked = [
      rm({ ollamaName: 'new-a', score: 63 }), // +3 < 5
      rm({ ollamaName: 'new-tie', score: 60 }), // tie
    ];
    const out = diffPoolAgainstRanking({ pool, ranked, proposalThreshold: 5, vramGb: 32 });
    expect(out).toHaveLength(0);
  });

  it('never proposes a candidate that does not fit hardware', () => {
    const pool = poolOf([pe({ ollamaName: 'old-a', currentScore: 60 })]);
    const ranked = [rm({ ollamaName: 'new-a', score: 95, fitsHardware: false })];
    const out = diffPoolAgainstRanking({ pool, ranked, proposalThreshold: 5, vramGb: 32 });
    expect(out).toHaveLength(0);
  });

  it('never proposes a candidate already installed in the pool', () => {
    const pool = poolOf([pe({ ollamaName: 'old-a', currentScore: 60 })]);
    const ranked = [rm({ ollamaName: 'old-a', score: 95 })]; // same name as pooled
    const out = diffPoolAgainstRanking({ pool, ranked, proposalThreshold: 5, vramGb: 32 });
    expect(out).toHaveLength(0);
  });
});

describe('diffPoolAgainstRanking (F7: rejected/pending dedup)', () => {
  const pool = poolOf([pe({ ollamaName: 'oldmodel', hfRepoId: 'org/old', currentScore: 60 })]);
  const ranked = [rm({ ollamaName: 'newmodel', hfRepoId: 'Org/New', score: 85 })];

  it('does not re-emit a (target, replaces) pair present in rejected history', () => {
    const out = diffPoolAgainstRanking({
      pool,
      ranked,
      proposalThreshold: 5,
      vramGb: 32,
      rejected: [{ target: 'newmodel', replaces: 'oldmodel' }],
    });
    expect(out).toHaveLength(0);
  });

  it('does not re-emit a (target, replaces) pair already pending', () => {
    const out = diffPoolAgainstRanking({
      pool,
      ranked,
      proposalThreshold: 5,
      vramGb: 32,
      pending: [{ target: 'newmodel', replaces: 'oldmodel' }],
    });
    expect(out).toHaveLength(0);
  });

  it('emits the pair when a different pair is rejected (dedup is pair-scoped)', () => {
    const out = diffPoolAgainstRanking({
      pool,
      ranked,
      proposalThreshold: 5,
      vramGb: 32,
      rejected: [{ target: 'someone-else', replaces: 'oldmodel' }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.target.ollamaName).toBe('newmodel');
  });
});

describe('diffPoolAgainstRanking (P5-SUG-ENGINE: fall-through past suppressed best candidate)', () => {
  const pool = poolOf([pe({ ollamaName: 'qwen3:8b', hfRepoId: 'org/qwen', currentScore: 60 })]);
  const ranked = [
    rm({ ollamaName: 'top:32b', hfRepoId: 'Org/Top', score: 80 }),
    rm({ ollamaName: 'next:14b', hfRepoId: 'Org/Next', score: 75 }),
  ];

  it('falls through to the next-best NON-suppressed candidate when the top pick is rejected', () => {
    const out = diffPoolAgainstRanking({
      pool,
      ranked,
      proposalThreshold: 5,
      vramGb: 32,
      rejected: [{ target: 'top:32b', replaces: 'qwen3:8b' }],
    });
    // The entry is not skipped — it falls through to the next-best viable swap.
    expect(out).toHaveLength(1);
    expect(out[0]!.target.ollamaName).toBe('next:14b');
  });

  it('emits nothing when every viable candidate for the entry is suppressed', () => {
    const out = diffPoolAgainstRanking({
      pool,
      ranked,
      proposalThreshold: 5,
      vramGb: 32,
      rejected: [
        { target: 'top:32b', replaces: 'qwen3:8b' },
        { target: 'next:14b', replaces: 'qwen3:8b' },
      ],
    });
    expect(out).toHaveLength(0);
  });
});
