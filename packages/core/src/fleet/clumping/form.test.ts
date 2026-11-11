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

describe('formClumps — rank and cap EMITTED WORK UNITS (D9)', () => {
  /** n independent (scope, kind) groups of 2, so each group yields exactly one clump. */
  function groups(n: number, weightOf: (i: number) => number): ClumpableItem[] {
    return Array.from({ length: n }, (_, i) => [
      mk(`g${i}a`, {
        scope: `src/s${i}`,
        weight: weightOf(i),
        conflictKeys: [`src/s${i}/a.ts`],
      }),
      mk(`g${i}b`, {
        scope: `src/s${i}`,
        weight: weightOf(i),
        conflictKeys: [`src/s${i}/b.ts`],
      }),
    ]).flat();
  }

  it('caps the number of units, counting clumps and solos together — not findings', () => {
    const r = formClumps(
      groups(5, (i) => 100 - i),
      { maxClumps: 2 }
    );
    expect(r.clumps).toHaveLength(2);
    expect(r.counts.clumps).toBe(2);
    // 3 dropped clumps x 2 members = 6 items, FLATTENED (A1).
    expect(r.overCap).toHaveLength(6);
    expect(r.counts.overCap).toBe(6);
  });

  it('keeps the heaviest units and sheds the lightest', () => {
    const r = formClumps(
      groups(3, (i) => (i === 0 ? 1 : i === 1 ? 500 : 50)),
      {
        maxClumps: 1,
      }
    );
    expect(r.clumps).toHaveLength(1);
    expect(r.clumps[0]!.weight).toBe(500);
    expect(r.overCap.map((i) => i.id).sort()).toEqual(['g0a', 'g0b', 'g2a', 'g2b']);
  });

  it('flattens an over-cap CLUMP into its member items, never a unit', () => {
    const r = formClumps(
      groups(2, () => 100),
      { maxClumps: 1 }
    );
    for (const shed of r.overCap) expect(typeof shed.id).toBe('string');
    expect(r.overCap.some((i) => (i as { members?: unknown }).members !== undefined)).toBe(false);
  });

  // Three single-item groups: each is below the default minToClump of 2, so all
  // three are SOLOS. The cap counts them as work units alongside clumps (D9).
  it('sheds solos over the cap too — the cap counts units, not clumps', () => {
    const r = formClumps(
      [mk('a', { scope: 'src/x' }), mk('b', { scope: 'src/y' }), mk('c', { scope: 'src/z' })],
      { maxClumps: 1 }
    );
    expect(r.clumps).toEqual([]);
    expect(r.solo).toHaveLength(1);
    expect(r.overCap).toHaveLength(2);
    expect(r.counts.solo).toBe(1);
  });

  it('emits nothing and sheds everything at maxClumps 0', () => {
    const r = formClumps(
      groups(2, () => 100),
      { maxClumps: 0 }
    );
    expect(r.clumps).toEqual([]);
    expect(r.solo).toEqual([]);
    expect(r.overCap).toHaveLength(4);
  });

  // The unit-id tiebreak at form.ts step 6. What it guarantees is NOT run-to-run
  // equality — `[...groups.keys()].sort()` already makes the pre-sort unit array a
  // deterministic function of the input SET, and V8's sort is stable, so two runs
  // over the same input agree with the tiebreak REMOVED. A test comparing two runs
  // therefore cannot falsify it. (Measured: a mutant deleting only the unit
  // tiebreak left all 77 tests green, including a test named for this very
  // property — it compared two runs over identically-ordered input.)
  //
  // The guarantee that IS observable is WHICH tied unit survives the cap: the
  // lexicographically smallest unit ids among the equal-weight candidates. These
  // cases pin that identity, and each carries the discrimination assertion that
  // makes it a probe rather than a tautology — the surviving set must differ from
  // the arrival-order prefix the suite would see with no tiebreak at all.
  describe('a weight tie between units is broken by unit id ascending', () => {
    // Ids ascend as scopes DESCEND, so sorted-by-id and arrival order (group key
    // ascending, form.ts:137) are exact reverses. Solo unit ids are item ids, so the
    // survivors can be named outright instead of derived from the implementation.
    function reversedSolos(): ClumpableItem[] {
      return ['a', 'b', 'c', 'd', 'e'].map((letter, i) =>
        mk(`solo-${letter}`, {
          scope: `src/s${4 - i}`,
          weight: 100,
          conflictKeys: [`src/s${4 - i}/f.ts`],
        })
      );
    }

    it('keeps the lexicographically smallest unit ids, not the ones that arrived first', () => {
      const r = formClumps(reversedSolos(), { maxClumps: 2 });
      expect(r.solo.map((i) => i.id)).toEqual(['solo-a', 'solo-b']);
      // ...and the rest are shed, not lost.
      expect(r.overCap.map((i) => i.id)).toEqual(['solo-c', 'solo-d', 'solo-e']);
    });

    it('positive control — arrival order really is the reverse, so the case discriminates', () => {
      // Uncapped, the units still come out id-ascending; what proves the tiebreak did
      // the work is that the groups were FED in the opposite order.
      expect(reversedSolos().map((i) => i.scope)).toEqual([
        'src/s4',
        'src/s3',
        'src/s2',
        'src/s1',
        'src/s0',
      ]);
      expect(formClumps(reversedSolos(), { maxClumps: 5 }).solo.map((i) => i.id)).toEqual([
        'solo-a',
        'solo-b',
        'solo-c',
        'solo-d',
        'solo-e',
      ]);
    });

    // A clump id is a content hash, so its lexicographic rank cannot be written down
    // by hand — it is read off an UNCAPPED run and the capped run must agree with it.
    it('keeps the lexicographically smallest CLUMP ids when every clump weighs the same', () => {
      const uncapped = formClumps(
        groups(10, () => 100),
        { maxClumps: 10 }
      );
      // Arrival order: one clump per group, groups visited by sorted group key.
      const arrival = Array.from(
        { length: 10 },
        (_, i) => uncapped.clumps.find((c) => c.members.some((m) => m.id === `g${i}a`))!.id
      );
      const smallest = [...arrival].sort().slice(0, 3);
      const capped = formClumps(
        groups(10, () => 100),
        { maxClumps: 3 }
      );
      expect(capped.clumps.map((c) => c.id)).toEqual(smallest);
      // DISCRIMINATION: with no tiebreak the stable sort would keep the first three
      // ARRIVALS. If the hash order ever coincided with arrival order this case would
      // pass while proving nothing, so the divergence is asserted, not assumed.
      expect(smallest).not.toEqual(arrival.slice(0, 3));
    });
  });
});
