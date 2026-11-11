import { describe, expect, it } from 'vitest';

import { formClumps } from './form';
import type { ClumpResult, ClumpableItem, Grade } from './types';

/**
 * Success criterion 6: every input item appears EXACTLY ONCE across
 * clumps ∪ floored ∪ overCap ∪ ungraded ∪ solo.
 *
 * Throws, rather than asserting, so the SAME helper can be used as its own positive
 * control below (fed a deliberately lossy result, it must reject).
 */
function assertConservation(items: readonly ClumpableItem[], r: ClumpResult): void {
  const placed: string[] = [
    ...r.clumps.flatMap((c) => c.members.map((m) => m.id)),
    ...r.floored.map((f) => f.item.id),
    ...r.overCap.map((i) => i.id),
    ...r.ungraded.map((i) => i.id),
    ...r.solo.map((i) => i.id),
  ];
  const input = items
    .map((i) => i.id)
    .slice()
    .sort();
  const seen = placed.slice().sort();
  const dupes = seen.filter((id, idx) => idx > 0 && seen[idx - 1] === id);
  if (dupes.length > 0) {
    throw new Error(
      `conservation: item(s) placed more than once: ${[...new Set(dupes)].join(', ')}`
    );
  }
  const lost = input.filter((id) => !seen.includes(id));
  if (lost.length > 0) throw new Error(`conservation: item(s) LOST: ${lost.join(', ')}`);
  const invented = seen.filter((id) => !input.includes(id));
  if (invented.length > 0) {
    throw new Error(`conservation: item(s) invented: ${invented.join(', ')}`);
  }
  // The counts object must tell the same story the buckets do.
  const { counts } = r;
  const tallied = counts.clumped + counts.floored + counts.overCap + counts.ungraded + counts.solo;
  if (counts.input !== items.length || tallied !== items.length) {
    throw new Error(
      `conservation: counts disagree — input=${counts.input}, tallied=${tallied}, actual=${items.length}`
    );
  }
}

const GRADES: Grade[] = [
  { kind: 'axes', tier: 'foundational', impact: 'large', confidence: 'high' },
  { kind: 'axes', tier: 'aspirational', impact: 'small', confidence: 'high' }, // below
  { kind: 'axes', tier: 'foundational', impact: 'large', confidence: 'low' }, // NOT below
  { kind: 'axes', tier: 'polish', impact: 'small', confidence: 'low' }, // below
  { kind: 'severity', severity: 'critical' },
  { kind: 'severity', severity: 'suggestion' }, // below
  { kind: 'ungraded' },
];

/**
 * A deterministic, adversarial corpus: it crosses every grade with repeated scopes,
 * kinds and SHARED conflict keys so the run exercises the floor, the ungraded
 * bucket, conflict splits, size splits, the solo rule and the cap in one pass.
 * No RNG — a law that only sometimes runs its hard case is not a law.
 */
function corpus(): ClumpableItem[] {
  const items: ClumpableItem[] = [];
  for (let i = 0; i < 90; i += 1) {
    const scope = `src/s${i % 6}`;
    items.push({
      id: `item-${String(i).padStart(3, '0')}`,
      scope,
      kind: ['CODE', 'NAME', 'SPEC'][i % 3]!,
      grade: GRADES[i % GRADES.length]!,
      weight: (i * 37) % 101,
      // Every 4th item deliberately COLLIDES on a hot file, forcing conflict splits.
      conflictKeys: i % 4 === 0 ? [`${scope}/hot.ts`] : [`${scope}/f${i}.ts`],
    });
  }
  return items;
}

describe('LAW — conservation (success criterion 6)', () => {
  it('holds over the adversarial corpus at the default policy', () => {
    const items = corpus();
    expect(() => assertConservation(items, formClumps(items))).not.toThrow();
  });

  it('holds with a tight cap, so over-cap clumps are flattened not dropped', () => {
    const items = corpus();
    expect(() => assertConservation(items, formClumps(items, { maxClumps: 2 }))).not.toThrow();
  });

  it('holds with a tight maxPerClump, so size-split remainders are not dropped', () => {
    const items = corpus();
    expect(() =>
      assertConservation(items, formClumps(items, { maxPerClump: 2, minToClump: 2 }))
    ).not.toThrow();
  });

  it('holds with a touched set, so acting on an item does not remove it from the report', () => {
    const items = corpus();
    const touched = items.flatMap((i) => [...i.conflictKeys]);
    expect(() =>
      assertConservation(items, formClumps(items, undefined, { touched }))
    ).not.toThrow();
  });

  it('holds with the floor disabled', () => {
    const items = corpus();
    expect(() =>
      assertConservation(items, formClumps(items, { floorEnabled: false }))
    ).not.toThrow();
  });

  it('holds on the empty input', () => {
    expect(() => assertConservation([], formClumps([]))).not.toThrow();
  });

  // POSITIVE CONTROL: the law can FAIL. A clean run and a check that cannot see a
  // violation look identical in output, so prove the checker rejects each shape of
  // violation at the SAME scope it is applied at.
  describe('positive control — assertConservation rejects a violated result', () => {
    const items = corpus();

    it('rejects a LOST item', () => {
      const r = formClumps(items);
      const lossy: ClumpResult = { ...r, ungraded: r.ungraded.slice(1) };
      expect(() => assertConservation(items, lossy)).toThrow(/LOST/);
    });

    it('rejects a DOUBLE-PLACED item', () => {
      const r = formClumps(items);
      const doubled: ClumpResult = { ...r, solo: [...r.solo, ...r.ungraded.slice(0, 1)] };
      expect(() => assertConservation(items, doubled)).toThrow(/more than once/);
    });

    it('rejects counts that disagree with the buckets', () => {
      const r = formClumps(items);
      const lying: ClumpResult = {
        ...r,
        counts: { ...r.counts, ungraded: r.counts.ungraded + 1 },
      };
      expect(() => assertConservation(items, lying)).toThrow(/counts disagree/);
    });
  });
});

describe('LAW — determinism (success criterion 7)', () => {
  it('produces byte-identical output across two runs over the same input', () => {
    const a = formClumps(corpus(), { maxClumps: 6, maxPerClump: 4 });
    const b = formClumps(corpus(), { maxClumps: 6, maxPerClump: 4 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('produces identical clump ids and identical member ORDER', () => {
    const a = formClumps(corpus());
    const b = formClumps(corpus());
    expect(b.clumps.map((c) => c.id)).toEqual(a.clumps.map((c) => c.id));
    expect(b.clumps.map((c) => c.members.map((m) => m.id))).toEqual(
      a.clumps.map((c) => c.members.map((m) => m.id))
    );
    expect(b.solo.map((i) => i.id)).toEqual(a.solo.map((i) => i.id));
    expect(b.overCap.map((i) => i.id)).toEqual(a.overCap.map((i) => i.id));
    expect(b.floored.map((f) => f.item.id)).toEqual(a.floored.map((f) => f.item.id));
  });

  it('keys a clump id on its CONTENT, not on the order the members arrived in', () => {
    const forward = corpus();
    const reversed = [...forward].reverse();
    const a = formClumps(forward);
    const b = formClumps(reversed);
    expect(b.clumps.map((c) => c.id).sort()).toEqual(a.clumps.map((c) => c.id).sort());
  });

  // POSITIVE CONTROL: the comparison can FAIL. Two genuinely different inputs must
  // NOT compare equal, or the assertions above would pass on anything.
  //
  // The perturbed id is READ OFF the result rather than hardcoded. A hardcoded id
  // silently defeats this control if that item happens to be floored or ungraded —
  // renaming an item that never reaches a clump leaves the clump id set identical,
  // and the control passes by accident while proving nothing. (Verified: hardcoding
  // `item-001`, which grades below the floor, makes this assertion FAIL.)
  it('positive control — a different input produces a different clump id set', () => {
    const base = formClumps(corpus());
    const clumpedId = base.clumps[0]!.members[0]!.id;
    const perturbed = formClumps(
      corpus().map((i) => (i.id === clumpedId ? { ...i, id: 'item-999' } : i))
    );
    expect(perturbed.clumps.map((c) => c.id).sort()).not.toEqual(
      base.clumps.map((c) => c.id).sort()
    );
  });

  it('clump ids have the documented shape', () => {
    expect(formClumps(corpus()).clumps[0]!.id).toMatch(/^clump-[0-9a-f]{16}$/);
  });

  // The corpus above weighs item i at `(i * 37) % 101`. 37 is invertible mod 101 and
  // i only ever reaches 89, so EVERY weight in it is distinct — the corpus contains
  // zero ties and therefore never reaches the weight-tie tiebreak at all. The spec
  // calls that tiebreak "load-bearing, not cosmetic", so a determinism law that
  // cannot see it removed is a law in name only. (Measured: deleting BOTH id
  // tiebreaks from form.ts leaves every assertion above GREEN.)
  //
  // These cases supply the ties the main corpus lacks. Determinism is asserted as
  // INPUT-ORDER INDEPENDENCE rather than run-to-run equality, because V8's sort is
  // stable: two runs over an identically-ordered array agree even with no tiebreak
  // whatsoever, so run-to-run equality is not a discriminating probe.
  describe('weight ties — the tiebreak the main corpus never reaches', () => {
    /**
     * One (scope, kind) group of n items, ALL the same weight, keys disjoint.
     *
     * The id is namespaced by SCOPE, not just by index: ids must be unique across
     * the whole call or `formClumps` rejects the input outright (criterion 12), and
     * a thrown duplicate-id error would make these cases fail for a reason that has
     * nothing to do with the tiebreak under test.
     */
    function tiedGroup(n: number, scope = 'src/tie'): ClumpableItem[] {
      const slug = scope.replace(/\//g, '-');
      return Array.from({ length: n }, (_, i) => ({
        id: `tied-${slug}-${String(i).padStart(2, '0')}`,
        scope,
        kind: 'CODE',
        grade: GRADES[0]!,
        weight: 50,
        conflictKeys: [`${scope}/f${i}.ts`],
      }));
    }

    /** n single-clump groups, every unit weighing the same, so the CAP must tiebreak. */
    function tiedUnits(n: number): ClumpableItem[] {
      return Array.from({ length: n }, (_, i) => tiedGroup(2, `src/u${i}`)).flat();
    }

    it('orders tied members identically however the input is ordered', () => {
      const forward = tiedGroup(6);
      const a = formClumps(forward);
      const b = formClumps([...forward].reverse());
      expect(b.clumps.map((c) => c.members.map((m) => m.id))).toEqual(
        a.clumps.map((c) => c.members.map((m) => m.id))
      );
    });

    it('keeps the SAME tied units under a cap however the input is ordered', () => {
      const forward = tiedUnits(10);
      const a = formClumps(forward, { maxClumps: 3 });
      const b = formClumps([...forward].reverse(), { maxClumps: 3 });
      expect(b.clumps.map((c) => c.id)).toEqual(a.clumps.map((c) => c.id));
      expect(b.overCap.map((i) => i.id)).toEqual(a.overCap.map((i) => i.id));
    });

    it('is byte-identical over tied input regardless of input order', () => {
      const forward = [...tiedGroup(6), ...tiedUnits(10)];
      const a = formClumps(forward, { maxClumps: 4 });
      const b = formClumps([...forward].reverse(), { maxClumps: 4 });
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    });

    // POSITIVE CONTROL for the three above: the comparison can FAIL. If reversing the
    // input were somehow a no-op, every assertion here would pass vacuously.
    it('positive control — the reversed input really is a different array', () => {
      const forward = tiedGroup(6);
      expect([...forward].reverse().map((i) => i.id)).not.toEqual(forward.map((i) => i.id));
    });
  });
});

// A law that silently stops exercising its hard paths is not a law. These numbers
// were MEASURED against the reference implementation; if a future corpus edit moves
// them, that is a visible, reviewed change rather than a quiet loss of coverage.
describe('corpus shape — the laws above actually reach every bucket', () => {
  it('exercises clumps, floored, ungraded, solo and conflict splits at the default policy', () => {
    const r = formClumps(corpus());
    expect(r.counts).toEqual({
      input: 90,
      clumps: 6,
      clumped: 31,
      floored: 39,
      flooredAct: 0, // no touched set at the default ⇒ every sub-floor item files
      flooredFile: 39,
      overCap: 0, // 6 clumps + 8 solos = 14 units, under the default cap of 20
      ungraded: 12,
      solo: 8,
      conflictSplits: 8,
    });
  });

  it('reaches a non-empty overCap under a tight cap', () => {
    expect(formClumps(corpus(), { maxClumps: 2 }).counts.overCap).toBeGreaterThan(0);
  });

  it('reaches a non-zero flooredAct when a touched set is supplied', () => {
    const items = corpus();
    const touched = items.flatMap((i) => [...i.conflictKeys]);
    expect(formClumps(items, undefined, { touched }).counts.flooredAct).toBeGreaterThan(0);
  });
});
