import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { buildClump, formClumps } from './form';
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

// C1 REGRESSION. The group key was `${scope} ${kind}`, guarded by a comment asserting
// "` ` cannot appear in a scope or kind" that nothing enforced. `scope` is documented
// as a directory (types.ts) and directories contain spaces, so a caller can FORGE one
// group key out of a different (scope, kind) pair. These are the exact colliding pairs,
// at the DEFAULT policy. Each case asserts the forged item's own scope and kind as
// well as the split, because the damage is not only an over-merged group: `buildClump`
// takes the emitted scope and kind off `members[0]`, so under the old key the third
// item was filed under a scope and a kind that were not its own.
describe('formClumps — the (scope, kind) key cannot be forged by a space in either field', () => {
  it("keeps 'src/my api'|'CODE' apart from 'src/my'|'api CODE'", () => {
    const r = formClumps([
      mk('a', { scope: 'src/my api', kind: 'CODE' }),
      mk('b', { scope: 'src/my api', kind: 'CODE' }),
      mk('c', { scope: 'src/my', kind: 'api CODE' }),
    ]);
    expect(r.clumps).toHaveLength(1);
    expect(r.clumps[0]!.members.map((m) => m.id)).toEqual(['a', 'b']);
    expect(r.clumps[0]!.scope).toBe('src/my api');
    expect(r.clumps[0]!.kind).toBe('CODE');
    expect(r.solo.map((i) => i.id)).toEqual(['c']);
  });

  it("keeps 'My Documents'|'a b' apart from 'My'|'Documents a b'", () => {
    const r = formClumps([
      mk('a', { scope: 'My Documents', kind: 'a b' }),
      mk('b', { scope: 'My Documents', kind: 'a b' }),
      mk('c', { scope: 'My', kind: 'Documents a b' }),
    ]);
    expect(r.clumps).toHaveLength(1);
    expect(r.clumps[0]!.members.map((m) => m.id)).toEqual(['a', 'b']);
    expect(r.clumps[0]!.scope).toBe('My Documents');
    expect(r.clumps[0]!.kind).toBe('a b');
    expect(r.solo.map((i) => i.id)).toEqual(['c']);
  });

  // POSITIVE CONTROL: the two cases above would also pass if `formClumps` never
  // grouped anything. Items that genuinely share a (scope, kind) must still clump.
  it('positive control — a genuinely shared (scope, kind) still forms one clump', () => {
    const r = formClumps([
      mk('a', { scope: 'src/my api', kind: 'CODE' }),
      mk('b', { scope: 'src/my api', kind: 'CODE' }),
      mk('c', { scope: 'src/my api', kind: 'CODE' }),
    ]);
    expect(r.clumps).toHaveLength(1);
    expect(r.clumps[0]!.members.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(r.solo).toEqual([]);
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

// The id's order-independence is NOT reachable through `formClumps`: members are
// already in canonical order by the time a clump is built (form.ts step 3), so a
// mutant dropping the `.sort()` in `buildClump` leaves the whole public-surface suite
// green. Measured: it did — 77/77. The helper is therefore tested DIRECTLY, with
// members handed in orders `formClumps` would never produce, which is the only way
// the sort's contribution can be observed at all.
// I6 REGRESSION. `buildClump` is unreachable with an empty list through `formClumps`,
// but it is EXPORTED precisely so it can be reached from outside, and `members[0]!`
// surfaced the condition as `TypeError: Cannot read properties of undefined` — which
// names neither the helper nor the mistake. `formClumps` already sets this module's
// standard by throwing a named error on a duplicate id.
describe('buildClump — an empty member list is refused by name, not crashed through', () => {
  it('throws an error naming the helper and what it cannot answer', () => {
    expect(() => buildClump([])).toThrow(/buildClump: refusing to build a clump with no members/);
  });

  // The DISCRIMINATING half: `expect(...).toThrow()` alone passed against the old
  // code too, because the old code threw as well — just opaquely. What changed is
  // WHICH error, so the test pins that it is no longer the undefined-property crash.
  it('is no longer the opaque TypeError the subscript produced', () => {
    expect(() => buildClump([])).not.toThrow(TypeError);
  });
});

describe('buildClump — the id hashes the member SET, not the order it arrived in', () => {
  const trio = () => [mk('b'), mk('c'), mk('a')];

  it('gives one id for one member set, whatever order the members are in', () => {
    const asGiven = buildClump(trio()).id;
    expect(buildClump([...trio()].reverse()).id).toBe(asGiven);
    expect(buildClump([mk('c'), mk('a'), mk('b')]).id).toBe(asGiven);
    expect(buildClump([mk('a'), mk('b'), mk('c')]).id).toBe(asGiven);
  });

  it('matches the id formula types.ts publishes: sha256(JSON([scope, kind, sorted ids]))', () => {
    const digest = createHash('sha256')
      .update(JSON.stringify(['src/api', 'CODE', ['a', 'b', 'c']]))
      .digest('hex')
      .slice(0, 16);
    expect(buildClump(trio()).id).toBe(`clump-${digest}`);
  });

  // C2 REGRESSION. The id used to hash `scope|kind|ids.join(',')`. The three fields
  // are fixed-arity so that join is safe, but the id LIST is not: a comma inside an
  // id moves the boundary, and both member sets below encode to `a,b,z`. `types.ts`
  // calls `id` "stable identity in the source system" — review-finding ids and issue
  // titles routinely contain commas — so this was reachable from every seam. These
  // are the exact pairs from the review, which collided on `clump-662b0302268d9f47`.
  it('gives different ids to member sets that a comma-joined id list conflates', () => {
    expect(buildClump([mk('a,b'), mk('z')]).id).not.toBe(buildClump([mk('a'), mk('b,z')]).id);
  });

  it('is reachable through the public API, not just the exported helper', () => {
    const left = formClumps([mk('a,b'), mk('z')]);
    const right = formClumps([mk('a'), mk('b,z')]);
    expect(left.clumps).toHaveLength(1);
    expect(right.clumps).toHaveLength(1);
    expect(left.clumps[0]!.id).not.toBe(right.clumps[0]!.id);
  });

  // POSITIVE CONTROL for the two cases above: they would also pass if every call
  // returned a fresh random id. The SAME member set must still hash to one id, with
  // the commas still in place.
  it('positive control — the same comma-bearing member set still hashes to one id', () => {
    expect(buildClump([mk('a,b'), mk('z')]).id).toBe(buildClump([mk('z'), mk('a,b')]).id);
  });

  // POSITIVE CONTROL: the id can differ. If `buildClump` returned a constant, or if
  // the comparisons above were somehow comparing one value with itself, they would
  // pass while proving nothing.
  it('positive control — a different member set, scope or kind gives a different id', () => {
    const base = buildClump(trio()).id;
    expect(buildClump([mk('b'), mk('c'), mk('d')]).id).not.toBe(base);
    expect(buildClump(trio().map((m) => ({ ...m, scope: 'src/other' }))).id).not.toBe(base);
    expect(buildClump(trio().map((m) => ({ ...m, kind: 'NAME' }))).id).not.toBe(base);
  });

  // I6 follow-on. The max-reduce is now seeded with `members[0].weight` rather than
  // `-Infinity`, so a clump whose heaviest member is NOT first is the ONLY input that
  // can tell `max(members)` apart from `members[0].weight`. Through `formClumps`
  // members always arrive weight-desc, so confusing the two would be invisible from
  // there — which is the kind of gap exporting this helper exists to close.
  it('reports the MAX member weight even when the heaviest member is not first', () => {
    const c = buildClump([
      mk('a', { weight: 5 }),
      mk('b', { weight: 900 }),
      mk('c', { weight: 50 }),
    ]);
    expect(c.weight).toBe(900);
  });

  // The ID ignores member order; the MEMBER LIST does not. `formClumps` relies on that
  // — it hands in weight-ordered members and the clump reports them in that order.
  it('keeps the members in the order it was given them', () => {
    expect(buildClump(trio()).members.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });
});
