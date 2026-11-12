import { describe, expect, it } from 'vitest';

import type { Confidence, Impact, Tier } from '../../craft/axes';
import {
  DEFAULT_CLUMP_POLICY,
  overlayClumpPolicy,
  resolveClumpPolicy,
  resolveFloor,
} from './floor';
import type { ClumpPolicy, ClumpableItem, Grade } from './types';

function item(grade: Grade, conflictKeys: readonly string[] = ['src/a.ts']): ClumpableItem {
  return { id: 'i1', scope: 'src', kind: 'CODE', grade, weight: 1, conflictKeys };
}
function axes(tier: Tier, impact: Impact, confidence: Confidence): Grade {
  return { kind: 'axes', tier, impact, confidence };
}

describe('resolveFloor — the axes rule is GROUPED, not flattened', () => {
  // The rule is `impact === 'small' && (tier === 'aspirational' || confidence === 'low')`.
  // The WRONG reading, `(small && aspirational) || low`, swallows every
  // low-confidence finding regardless of impact. The two readings agree on most
  // inputs and differ on exactly the rows marked ** below — which is why the
  // table, not a spot check, is the test.
  const cases: Array<[Tier, Impact, Confidence, boolean]> = [
    // POSITIVE CONTROL (success criterion 3): the wrong reading floors this; the
    // right one does not. If this row ever goes green as `true`, the floor has
    // become a silent delete for every low-confidence finding.
    ['foundational', 'large', 'low', false], // **
    ['polish', 'medium', 'low', false], // **
    ['aspirational', 'large', 'low', false], // **
    ['foundational', 'small', 'low', true],
    ['polish', 'small', 'low', true],
    ['aspirational', 'small', 'high', true],
    ['aspirational', 'small', 'medium', true],
    ['polish', 'small', 'medium', false],
    ['polish', 'small', 'high', false],
    ['foundational', 'small', 'high', false],
    ['aspirational', 'medium', 'high', false],
    ['foundational', 'large', 'high', false],
  ];

  for (const [tier, impact, confidence, expected] of cases) {
    it(`${tier}/${impact}/${confidence} → below=${expected}`, () => {
      expect(resolveFloor(item(axes(tier, impact, confidence)), {}).below).toBe(expected);
    });
  }

  it('names a reason whenever it floors', () => {
    const v = resolveFloor(item(axes('aspirational', 'small', 'high')), {});
    expect(v.below).toBe(true);
    if (v.below) expect(v.reason).toMatch(/\S/);
  });
});

describe('resolveFloor — severity grades', () => {
  it('floors a suggestion', () => {
    expect(resolveFloor(item({ kind: 'severity', severity: 'suggestion' }), {}).below).toBe(true);
  });
  it('does not floor important or critical', () => {
    expect(resolveFloor(item({ kind: 'severity', severity: 'important' }), {}).below).toBe(false);
    expect(resolveFloor(item({ kind: 'severity', severity: 'critical' }), {}).below).toBe(false);
  });
});

describe('resolveFloor — an ungraded item is NEVER floored (D8)', () => {
  it('passes an ungraded item above the floor', () => {
    expect(resolveFloor(item({ kind: 'ungraded' }), {}).below).toBe(false);
  });
  it('stays above the floor even with a touched set that would allow acting', () => {
    expect(resolveFloor(item({ kind: 'ungraded' }), { touched: ['src/a.ts'] }).below).toBe(false);
  });
});

describe('resolveFloor — floorResolution is a CEILING the touched set narrows', () => {
  const sub = item(axes('aspirational', 'small', 'high'), ['src/a.ts', 'src/b.ts']);

  it("is 'act' when every conflict key is already inside the touched set", () => {
    const v = resolveFloor(sub, { touched: ['src/a.ts', 'src/b.ts', 'src/c.ts'] });
    expect(v).toMatchObject({ below: true, resolution: 'act' });
  });

  it("degrades to 'file' when ANY key falls outside the touched set", () => {
    const v = resolveFloor(sub, { touched: ['src/a.ts'] });
    expect(v).toMatchObject({ below: true, resolution: 'file' });
  });

  it("degrades to 'file' when no touched set is supplied at all", () => {
    expect(resolveFloor(sub, {})).toMatchObject({ below: true, resolution: 'file' });
  });

  it("degrades to 'file' when the touched set is empty", () => {
    expect(resolveFloor(sub, { touched: [] })).toMatchObject({
      below: true,
      resolution: 'file',
    });
  });

  it("never exceeds a 'file' ceiling even inside the touched set", () => {
    const v = resolveFloor(sub, { touched: ['src/a.ts', 'src/b.ts'] }, { floorResolution: 'file' });
    expect(v).toMatchObject({ below: true, resolution: 'file' });
  });

  // ASSUMPTION A3, asserted explicitly so the interpretation is visible rather
  // than accidental: an item claiming NO hunk CANNOT be acted on in place — you
  // cannot act on a file you cannot name — so it degrades to 'file' even inside a
  // non-empty touched set. The guard in `narrow` is explicit because `every` over an
  // empty array is vacuously TRUE: without it, the keyless item got the MOST
  // permissive resolution available, 'act', the moment any unrelated file was
  // touched — the opposite of the rationale the function's own doc comment gives.
  it("degrades an item with no conflict keys to 'file' even inside a touched set", () => {
    const noKeys = item(axes('aspirational', 'small', 'high'), []);
    expect(resolveFloor(noKeys, { touched: ['src/z.ts'] })).toMatchObject({
      below: true,
      resolution: 'file',
    });
  });

  // POSITIVE CONTROL: the keyless rule must not have become a blanket 'file'. A
  // keyed item inside the SAME touched set still resolves to 'act'.
  it('positive control — a keyed item inside that same touched set still acts', () => {
    const keyed = item(axes('aspirational', 'small', 'high'), ['src/z.ts']);
    expect(resolveFloor(keyed, { touched: ['src/z.ts'] })).toMatchObject({
      below: true,
      resolution: 'act',
    });
  });
});

describe('resolveFloor — floorEnabled is the escape hatch', () => {
  it('returns above-floor for everything when disabled', () => {
    const v = resolveFloor(item(axes('aspirational', 'small', 'low')), {}, { floorEnabled: false });
    expect(v).toEqual({ below: false });
  });
});

describe('resolveFloor — the shared above-floor verdict is FROZEN', () => {
  // Both above-floor paths (floor disabled, and classify says not below) return ONE
  // shared object. Measured before the freeze: two calls on DIFFERENT items returned
  // the same identity, `Object.isFrozen` was false, and after a single
  // `verdict.below = true` a CRITICAL item's verdict read `{ below: true }` — the
  // floor silently converted into a process-wide delete, with nothing in any output
  // to say so, and reachable from all three seams phases 3-5 bind.
  const critical = item({ kind: 'severity', severity: 'critical' });

  it('hands back a frozen verdict, so a write THROWS instead of poisoning the next caller', () => {
    const v = resolveFloor(critical, {});
    expect(Object.isFrozen(v)).toBe(true);
    // Strict mode (every module here is ESM/TS) makes the write throw rather than
    // silently no-op, which is what keeps the violation loud.
    expect(() => {
      (v as { below: boolean }).below = true;
    }).toThrow(TypeError);
    expect(v.below).toBe(false);
    // The property that actually matters: the NEXT caller is unaffected.
    expect(resolveFloor(item({ kind: 'severity', severity: 'critical' }), {}).below).toBe(false);
    expect(
      resolveFloor(item(axes('aspirational', 'small', 'low')), {}, { floorEnabled: false }).below
    ).toBe(false);
  });

  // POSITIVE CONTROL for the freeze: sealing the shared ABOVE verdict must not have
  // sealed — or shared — the BELOW-floor verdict, which carries a per-item `reason`
  // and must therefore stay a fresh object per call. If this ever goes red, the fix
  // over-reached and two different floored items are sharing one reason.
  it('positive control — a below-floor verdict is still a fresh object per call', () => {
    const first = resolveFloor(item(axes('aspirational', 'small', 'high'), ['src/a.ts']), {});
    const second = resolveFloor(item(axes('polish', 'small', 'low'), ['src/b.ts']), {});
    expect(first.below).toBe(true);
    expect(second.below).toBe(true);
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(false);
    if (first.below && second.below) {
      expect(first.reason).toBe('small impact with aspirational tier');
      expect(second.reason).toBe('small impact with low confidence');
    }
  });
});

describe('resolveClumpPolicy — absent config applies defaults and never errors', () => {
  it('returns the documented defaults for no argument', () => {
    expect(resolveClumpPolicy()).toEqual({
      maxPerClump: 12,
      maxClumps: 20,
      minToClump: 2,
      floorResolution: 'act',
      floorEnabled: true,
    });
  });
  it('merges a partial override', () => {
    expect(resolveClumpPolicy({ maxPerClump: 3 }).maxPerClump).toBe(3);
    expect(resolveClumpPolicy({ maxPerClump: 3 }).maxClumps).toBe(20);
  });
  // An explicit `undefined` must NOT clobber a default — a naive object spread
  // would, and a config loader that emits `{ maxClumps: undefined }` is ordinary.
  it('ignores an explicitly-undefined field', () => {
    // A config loader emitting `{ maxClumps: undefined }` is ordinary at RUNTIME, and
    // it is exactly the shape a naive object spread would let clobber a default with
    // `undefined`. The repo compiles with `exactOptionalPropertyTypes: true`, which
    // forbids WRITING that literal, so the cast reconstructs the runtime shape the
    // type system refuses to spell. The assertion itself is unweakened: the resolved
    // value must still be the default 20.
    const fromLoader = { maxClumps: undefined } as unknown as Partial<ClumpPolicy>;
    expect(resolveClumpPolicy(fromLoader).maxClumps).toBe(20);
  });
  // The test NAME claims a property, so it asserts that property. It used to assert
  // only `DEFAULT_CLUMP_POLICY.maxPerClump === 12` — a duplicate of the defaults case
  // above, and a line that passes identically against a mutable object every consumer
  // of the barrel can rewrite process-wide. Measured before the fix:
  // `Object.isFrozen(DEFAULT_CLUMP_POLICY)` was `false` and the assignment succeeded.
  it('exposes the defaults as a frozen constant, not a mutable shared object', () => {
    expect(Object.isFrozen(DEFAULT_CLUMP_POLICY)).toBe(true);
    // Strict mode (every module here is ESM/TS) makes the write THROW rather than
    // silently no-op, which is what keeps a violation loud instead of invisible.
    expect(() => {
      (DEFAULT_CLUMP_POLICY as ClumpPolicy).maxPerClump = 999;
    }).toThrow(TypeError);
    expect(DEFAULT_CLUMP_POLICY.maxPerClump).toBe(12);
  });

  // POSITIVE CONTROL for the freeze: sealing the shared constant must not seal what
  // callers get back. A resolved policy is a fresh object they may own and mutate.
  it('positive control — a resolved policy is a fresh mutable object, not the constant', () => {
    const resolved = resolveClumpPolicy();
    expect(resolved).not.toBe(DEFAULT_CLUMP_POLICY);
    expect(Object.isFrozen(resolved)).toBe(false);
    resolved.maxPerClump = 3;
    expect(resolved.maxPerClump).toBe(3);
    expect(DEFAULT_CLUMP_POLICY.maxPerClump).toBe(12);
  });
});

/**
 * THE PROPERTY: a field the caller did not set cannot erase a field the
 * baseline did.
 *
 * `{ ...baseline, ...policy }` copies a key that is PRESENT AND `undefined`,
 * and `undefined` then fails every `<` comparison downstream in silence. Two
 * seam entry points used that spread while sitting two modules away from the
 * comments explaining why it is wrong. The loud stake is the review seam's
 * `floorEnabled: false` (an `undefined` restores `true` and re-runs the floor
 * over the set the floor already selected); at intake, restoring the
 * primitive's 20 is measured rather than guessed — `overCap` 128 on the
 * 347-issue backlog (2026-11-11), inert for grouping at 20 and a real shed
 * below the formed-unit count.
 *
 * `exactOptionalPropertyTypes` is why this needed a test rather than a type:
 * under it, `Partial<ClumpPolicy>` does NOT admit `{ maxClumps: undefined }`,
 * so the defect is unreachable from a TYPED caller and reachable from every
 * other one — the zod config block types each field `T | undefined`, and these
 * are exported functions.
 */
describe('overlayClumpPolicy — an undefined field never clobbers a baseline', () => {
  const INTAKE: Partial<ClumpPolicy> = { maxClumps: Number.MAX_SAFE_INTEGER };

  it('skips a key that is PRESENT and undefined', () => {
    expect(overlayClumpPolicy(INTAKE, { maxClumps: undefined })).toEqual(INTAKE);
    // The spread this replaces, for contrast — it produces the clobbered value
    // and therefore the primitive's cap of 20 one resolution later.
    expect({ ...INTAKE, ...{ maxClumps: undefined } }.maxClumps).toBeUndefined();
    expect(resolveClumpPolicy({ ...INTAKE, ...{ maxClumps: undefined } }).maxClumps).toBe(20);
    // …while the overlay keeps the baseline all the way through resolution.
    expect(resolveClumpPolicy(overlayClumpPolicy(INTAKE, { maxClumps: undefined })).maxClumps).toBe(
      Number.MAX_SAFE_INTEGER
    );
  });

  it('POSITIVE CONTROL: a DEFINED field does override the baseline', () => {
    // Without this, a merge that ignored `over` entirely passes the test above.
    expect(overlayClumpPolicy(INTAKE, { maxClumps: 5 })).toEqual({ maxClumps: 5 });
  });

  it('keeps a legitimate `false`, which a `||` would drop', () => {
    expect(overlayClumpPolicy({ floorEnabled: true }, { floorEnabled: false })).toEqual({
      floorEnabled: false,
    });
  });

  it('covers EVERY tunable, not just the ones a caller happened to test', () => {
    // A field added to `ClumpPolicy` and forgotten in the merge would silently
    // never override. Asserted over the whole shape rather than field by field.
    const under: Partial<ClumpPolicy> = {
      maxPerClump: 1,
      maxClumps: 1,
      minToClump: 2,
      floorResolution: 'act',
      floorEnabled: true,
    };
    const over: ClumpPolicy = {
      maxPerClump: 9,
      maxClumps: 9,
      minToClump: 9,
      floorResolution: 'file',
      floorEnabled: false,
    };
    expect(overlayClumpPolicy(under, over)).toEqual(over);
    expect(Object.keys(over).sort()).toEqual(Object.keys(DEFAULT_CLUMP_POLICY).sort());
  });

  it('an absent `over` returns a COPY of the baseline, not the baseline itself', () => {
    // `DEFAULT_CLUMP_POLICY` is frozen and seam baselines are module constants;
    // handing back the same object would let one caller's later mutation move
    // every other caller's policy.
    const under: Partial<ClumpPolicy> = { maxClumps: 3 };
    const out = overlayClumpPolicy(under, undefined);
    expect(out).toEqual(under);
    expect(out).not.toBe(under);
  });
});
