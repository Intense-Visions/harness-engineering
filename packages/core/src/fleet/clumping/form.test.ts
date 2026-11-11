import { describe, expect, it } from 'vitest';

import { formClumps } from './form';
import type { ClumpableItem, Grade } from './types';

const ABOVE: Grade = { kind: 'axes', tier: 'foundational', impact: 'large', confidence: 'high' };
const BELOW: Grade = { kind: 'axes', tier: 'aspirational', impact: 'small', confidence: 'high' };
const UNGRADED: Grade = { kind: 'ungraded' };

function mk(id: string, overrides: Partial<ClumpableItem> = {}): ClumpableItem {
  return {
    id,
    scope: 'src/api',
    kind: 'CODE',
    grade: ABOVE,
    weight: 100,
    conflictKeys: [`src/api/${id}.ts`],
    ...overrides,
  };
}

describe('formClumps — empty input', () => {
  it('returns an empty result with every count zero, and does NOT error', () => {
    const r = formClumps([]);
    expect(r.clumps).toEqual([]);
    expect(r.floored).toEqual([]);
    expect(r.overCap).toEqual([]);
    expect(r.ungraded).toEqual([]);
    expect(r.solo).toEqual([]);
    expect(r.conflictSplits).toBe(0);
    expect(r.counts).toEqual({
      input: 0,
      clumps: 0,
      clumped: 0,
      floored: 0,
      flooredAct: 0,
      flooredFile: 0,
      overCap: 0,
      ungraded: 0,
      solo: 0,
      conflictSplits: 0,
    });
  });
});

describe('formClumps — one clump per (scope, kind) with disjoint keys (criterion 1)', () => {
  it('emits exactly one clump with all N members', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => mk(id));
    const r = formClumps(items);
    expect(r.clumps).toHaveLength(1);
    expect(r.clumps[0]!.members.map((m) => m.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(r.clumps[0]!.scope).toBe('src/api');
    expect(r.clumps[0]!.kind).toBe('CODE');
    expect(r.solo).toEqual([]);
    expect(r.conflictSplits).toBe(0);
  });

  it('is as urgent as its worst member and unions their conflict keys', () => {
    const r = formClumps([mk('a', { weight: 5 }), mk('b', { weight: 900 })]);
    expect(r.clumps[0]!.weight).toBe(900);
    expect(r.clumps[0]!.conflictKeys).toEqual(['src/api/a.ts', 'src/api/b.ts']);
  });

  it('never co-clumps across a different scope or a different kind', () => {
    const r = formClumps([
      mk('a'),
      mk('b'),
      mk('c', { scope: 'src/cli' }),
      mk('d', { scope: 'src/cli' }),
      mk('e', { kind: 'NAME' }),
      mk('f', { kind: 'NAME' }),
    ]);
    expect(r.clumps).toHaveLength(3);
    for (const c of r.clumps) expect(c.members).toHaveLength(2);
  });

  it('co-groups an item that claims no hunk at all', () => {
    const r = formClumps([mk('a'), mk('b'), mk('c', { conflictKeys: [] })]);
    expect(r.clumps).toHaveLength(1);
    expect(r.clumps[0]!.members).toHaveLength(3);
  });
});

describe('formClumps — conflict split (criterion 2)', () => {
  it('never places two items sharing a conflict key in the same clump', () => {
    const shared = ['src/api/router.ts'];
    const r = formClumps([
      mk('a', { conflictKeys: shared, weight: 300 }),
      mk('b', { conflictKeys: shared, weight: 200 }),
      mk('c', { conflictKeys: shared, weight: 100 }),
      mk('d', { conflictKeys: ['src/api/other.ts'], weight: 250 }),
    ]);
    for (const c of r.clumps) {
      const keys = c.members.flatMap((m) => [...m.conflictKeys]);
      expect(new Set(keys).size).toBe(keys.length);
    }
    const placed = [
      ...r.clumps.flatMap((c) => c.members.map((m) => m.id)),
      ...r.solo.map((i) => i.id),
    ];
    expect(placed.sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(r.conflictSplits).toBeGreaterThan(0);
  });

  it('degenerates a fully-mutually-conflicting group to N solos and records the splits', () => {
    const shared = ['src/api/router.ts'];
    const r = formClumps([
      mk('a', { conflictKeys: shared }),
      mk('b', { conflictKeys: shared }),
      mk('c', { conflictKeys: shared }),
    ]);
    expect(r.clumps).toEqual([]);
    expect(r.solo.map((i) => i.id).sort()).toEqual(['a', 'b', 'c']);
    expect(r.conflictSplits).toBe(2);
  });
});

describe('formClumps — the floor runs FIRST (criterion 11)', () => {
  it('sheds sub-floor items before grouping and never fabricates a clump', () => {
    const r = formClumps([
      mk('a', { grade: BELOW }),
      mk('b', { grade: BELOW }),
      mk('c', { grade: BELOW }),
    ]);
    expect(r.clumps).toEqual([]);
    expect(r.solo).toEqual([]);
    expect(r.floored.map((f) => f.item.id).sort()).toEqual(['a', 'b', 'c']);
    expect(r.counts.floored).toBe(3);
  });

  it("records 'act' when the caller's touched set covers the item, 'file' otherwise", () => {
    const r = formClumps([mk('a', { grade: BELOW }), mk('b', { grade: BELOW })], undefined, {
      touched: ['src/api/a.ts'],
    });
    const byId = new Map(r.floored.map((f) => [f.item.id, f.resolution]));
    expect(byId.get('a')).toBe('act');
    expect(byId.get('b')).toBe('file');
    expect(r.counts.flooredAct).toBe(1);
    expect(r.counts.flooredFile).toBe(1);
  });

  it('leaves nothing floored when the floor is disabled', () => {
    const r = formClumps([mk('a', { grade: BELOW }), mk('b', { grade: BELOW })], {
      floorEnabled: false,
    });
    expect(r.floored).toEqual([]);
    expect(r.clumps).toHaveLength(1);
  });
});

describe('formClumps — ungraded is a terminal, reported bucket (criterion 4, D8)', () => {
  it('reports an ungraded item in `ungraded` and floors nothing', () => {
    const r = formClumps([mk('a'), mk('b'), mk('u', { grade: UNGRADED })]);
    expect(r.ungraded.map((i) => i.id)).toEqual(['u']);
    expect(r.floored).toEqual([]);
    expect(r.counts.ungraded).toBe(1);
  });

  it('does NOT also place an ungraded item in a clump or solo (disjointness)', () => {
    const r = formClumps([mk('a'), mk('b'), mk('u', { grade: UNGRADED })]);
    const elsewhere = [
      ...r.clumps.flatMap((c) => c.members.map((m) => m.id)),
      ...r.solo.map((i) => i.id),
      ...r.overCap.map((i) => i.id),
    ];
    expect(elsewhere).not.toContain('u');
  });
});

describe('formClumps — duplicate ids are rejected LOUDLY (criterion 12)', () => {
  it('throws rather than collapsing two items into one', () => {
    expect(() => formClumps([mk('a'), mk('a', { scope: 'src/cli' })])).toThrow(/duplicate/i);
  });
  it('names the offending id in the message', () => {
    expect(() => formClumps([mk('dup'), mk('dup')])).toThrow(/dup/);
  });
  it('does not throw for distinct ids that merely look alike', () => {
    expect(() => formClumps([mk('a'), mk('A')])).not.toThrow();
  });
});

describe('formClumps — size split and the solo rule', () => {
  it('splits a group over maxPerClump into weight-ordered chunks', () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      mk(`i${i}`, { weight: 100 - i, conflictKeys: [`src/api/i${i}.ts`] })
    );
    const r = formClumps(items, { maxPerClump: 3 });
    expect(r.clumps.map((c) => c.members.length).sort()).toEqual([3, 3]);
    // The 7th member is a 1-chunk remainder, which is below minToClump ⇒ solo.
    expect(r.solo).toHaveLength(1);
    expect(r.solo[0]!.id).toBe('i6'); // lowest weight, last chunk
  });

  it('orders members within a clump by weight desc, tiebreak id asc', () => {
    const r = formClumps([
      mk('zz', { weight: 10, conflictKeys: ['src/api/1.ts'] }),
      mk('aa', { weight: 10, conflictKeys: ['src/api/2.ts'] }),
      mk('mm', { weight: 99, conflictKeys: ['src/api/3.ts'] }),
    ]);
    expect(r.clumps[0]!.members.map((m) => m.id)).toEqual(['mm', 'aa', 'zz']);
  });

  it('keeps a group below minToClump as solo items, not a one-member clump', () => {
    const r = formClumps([mk('only')]);
    expect(r.clumps).toEqual([]);
    expect(r.solo.map((i) => i.id)).toEqual(['only']);
    expect(r.counts.solo).toBe(1);
  });

  it('honours a raised minToClump', () => {
    const r = formClumps([mk('a'), mk('b')], { minToClump: 3 });
    expect(r.clumps).toEqual([]);
    expect(r.solo).toHaveLength(2);
  });

  it('does not split at all when maxPerClump exceeds the group size', () => {
    const r = formClumps([mk('a'), mk('b'), mk('c')], { maxPerClump: 12 });
    expect(r.clumps).toHaveLength(1);
    expect(r.clumps[0]!.members).toHaveLength(3);
  });

  // A non-positive cap is operator error, not an infinite loop.
  it('treats a non-positive maxPerClump as a no-split rather than hanging', () => {
    const r = formClumps([mk('a'), mk('b')], { maxPerClump: 0 });
    expect(r.clumps.length + r.solo.length).toBeGreaterThan(0);
  });

  it('counts a size split as zero conflictSplits — the name means conflict', () => {
    const items = Array.from({ length: 4 }, (_, i) =>
      mk(`s${i}`, { conflictKeys: [`src/api/s${i}.ts`] })
    );
    expect(formClumps(items, { maxPerClump: 2 }).conflictSplits).toBe(0);
  });
});
