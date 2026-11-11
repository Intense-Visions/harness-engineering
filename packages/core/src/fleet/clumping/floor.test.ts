import { describe, expect, it } from 'vitest';

import type { Confidence, Impact, Tier } from '../../craft/axes';
import { DEFAULT_CLUMP_POLICY, resolveClumpPolicy, resolveFloor } from './floor';
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
  // than accidental: an item claiming NO hunk is vacuously inside any touched set.
  it('treats an item with no conflict keys as vacuously inside a non-empty touched set', () => {
    const noKeys = item(axes('aspirational', 'small', 'high'), []);
    expect(resolveFloor(noKeys, { touched: ['src/z.ts'] })).toMatchObject({
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
