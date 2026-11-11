// packages/core/src/fleet/clumping/floor.ts
//
// The floor: is this item worth the ceremony cost of being FILED, or should it be
// ACTED ON in place? (docs/changes/clumping/proposal.md, "The floor".)
//
// Pure — no fs, no network, no clock. Every function is a transform over data the
// caller already has, matching fleet/claims and fleet/context-budget.
//
// Policy resolution lives here, not in types.ts, because the floor is the policy's
// first consumer and types.ts is declarations-only.

import type { ClumpPolicy, ClumpableItem, FloorContext, FloorVerdict } from './types';

/**
 * Defaults matching craft-fleet's existing caps. Absent config ⇒ these apply, no error.
 *
 * FROZEN, not frozen-by-convention. This constant is re-exported from the package
 * barrel, so without the freeze any consumer — including the three seams phases 3-5
 * bind — could write `DEFAULT_CLUMP_POLICY.maxPerClump = 999` and move the floor's
 * defaults process-wide for every OTHER caller, with nothing in the output to say
 * so. Every module here is an ESM/TS module and therefore strict, so the freeze
 * turns that write into a thrown `TypeError` rather than a silent no-op, which is
 * what makes the violation loud. `resolveClumpPolicy` still returns a fresh mutable
 * object; only the shared constant is sealed, and `floor.test.ts` pins both halves.
 */
export const DEFAULT_CLUMP_POLICY: Readonly<ClumpPolicy> = Object.freeze({
  maxPerClump: 12,
  maxClumps: 20,
  minToClump: 2,
  floorResolution: 'act',
  floorEnabled: true,
});

/**
 * One field, defaulted.
 *
 * `??` rather than an object spread ON PURPOSE: a spread lets an explicitly-
 * `undefined` field (ordinary output from a config loader) clobber a default with
 * `undefined`, which then fails a `<` comparison silently. `??` also leaves a
 * legitimate `false` (`floorEnabled`) alone, which `||` would not.
 *
 * Extracted as a helper rather than written five times inline because five inline
 * `?.`/`??` pairs put `resolveClumpPolicy` over the repo's cyclomatic-complexity
 * threshold (measured: 17 vs. 15). The semantics are identical.
 */
function withDefault<K extends keyof ClumpPolicy>(
  policy: Partial<ClumpPolicy> | undefined,
  key: K
): ClumpPolicy[K] {
  return policy?.[key] ?? DEFAULT_CLUMP_POLICY[key];
}

/** Fill a partial policy from the defaults. Absent config ⇒ defaults, never an error. */
export function resolveClumpPolicy(policy?: Partial<ClumpPolicy>): ClumpPolicy {
  return {
    maxPerClump: withDefault(policy, 'maxPerClump'),
    maxClumps: withDefault(policy, 'maxClumps'),
    minToClump: withDefault(policy, 'minToClump'),
    floorResolution: withDefault(policy, 'floorResolution'),
    floorEnabled: withDefault(policy, 'floorEnabled'),
  };
}

const ABOVE: FloorVerdict = { below: false };

/**
 * Is the item below the floor, and why?
 *
 * The axes rule is grouped EXACTLY as craft-fleet/SKILL.md:78 states it:
 *
 *     impact === 'small' && (tier === 'aspirational' || confidence === 'low')
 *
 * NOT `(small && aspirational) || low`. That flattened reading floors every
 * low-confidence finding whatever its impact — and a floor that silently swallowed
 * them would look IDENTICAL in output to a correct one. `foundational/large/low`
 * is the positive control that separates the two, and floor.test.ts pins the whole
 * truth table rather than a spot check.
 */
function classify(item: ClumpableItem): { below: boolean; reason: string } {
  const grade = item.grade;
  switch (grade.kind) {
    case 'axes': {
      const small = grade.impact === 'small';
      const weak = grade.tier === 'aspirational' || grade.confidence === 'low';
      if (!(small && weak)) return { below: false, reason: '' };
      const why = grade.tier === 'aspirational' ? 'aspirational tier' : 'low confidence';
      return { below: true, reason: `small impact with ${why}` };
    }
    case 'severity':
      return grade.severity === 'suggestion'
        ? { below: true, reason: 'severity is suggestion' }
        : { below: false, reason: '' };
    case 'ungraded':
      // D8: an item with no gradable signal is NEVER floored. The floor does not
      // get to guess — a fabricated grade is a lie in the queue.
      return { below: false, reason: '' };
  }
}

/**
 * Narrow the policy CEILING to an actual resolution.
 *
 * `'act'` requires every one of the item's conflict keys to already be inside
 * `ctx.touched`: fixing a small item in place is cheap precisely because the file is
 * already open. Outside the touched set — or with no touched set at all — acting is
 * diff creep wearing a bias-for-action costume, so the resolution degrades to
 * `'file'` (D4).
 *
 * ASSUMPTION, named here so the code and `floor.test.ts` agree rather than each
 * stating half of it: an item with NO conflict keys ALSO degrades to `'file'`. The
 * guard is explicit because `every` over an empty array is vacuously true, so the
 * unguarded reading handed the MOST permissive resolution to the item that justifies
 * it least — a keyless item resolved to `'act'` the moment any unrelated file was
 * touched, contradicting the rationale one line above. You cannot act in place on a
 * file you cannot name.
 *
 * The asymmetry with `splitOnConflict` in form.ts, where the same vacuity stands, is
 * DELIBERATE: a keyless item joining a clump claims no hunk and harms no one, while
 * resolving it to `'act'` authorizes a write.
 */
function narrow(item: ClumpableItem, ctx: FloorContext, policy: ClumpPolicy): 'act' | 'file' {
  if (policy.floorResolution === 'file') return 'file';
  const touched = ctx.touched;
  if (touched === undefined || touched.length === 0) return 'file';
  if (item.conflictKeys.length === 0) return 'file';
  return item.conflictKeys.every((key) => touched.includes(key)) ? 'act' : 'file';
}

/** Decide whether an item is worth filing, and if not, what to do with it instead. */
export function resolveFloor(
  item: ClumpableItem,
  ctx: FloorContext = {},
  policy?: Partial<ClumpPolicy>
): FloorVerdict {
  const resolved = resolveClumpPolicy(policy);
  if (!resolved.floorEnabled) return ABOVE;
  const { below, reason } = classify(item);
  if (!below) return ABOVE;
  return { below: true, resolution: narrow(item, ctx, resolved), reason };
}
