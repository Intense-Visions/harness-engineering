// packages/core/src/fleet/clumping/view.ts
//
// The projection from a `ClumpResult` (in-process, carries each item's native
// record on `ref`) to a `ClumpView` (serialized, carries member ids).
//
// Pure — no fs, no network, no clock, like every other module in this folder.

import type { ClumpResult, ClumpView, ClumpableItem } from './types';

/** An item on the wire is its id. */
function idOf(item: ClumpableItem): string {
  return item.id;
}

/**
 * Drop every `ref` and keep the structure.
 *
 * The buckets, the counts and the conservation law survive unchanged, so a
 * consumer checking `input === clumped + floored + overCap + ungraded + solo`
 * can still check it from the view alone — which matters, because the view is
 * the only form most consumers ever see.
 */
export function toClumpView(result: ClumpResult): ClumpView {
  return {
    clumps: result.clumps.map((clump) => ({
      id: clump.id,
      scope: clump.scope,
      kind: clump.kind,
      weight: clump.weight,
      conflictKeys: clump.conflictKeys,
      members: clump.members.map((member) => ({ id: member.id })),
    })),
    floored: result.floored.map((entry) => ({
      id: entry.item.id,
      resolution: entry.resolution,
      reason: entry.reason,
    })),
    overCap: result.overCap.map(idOf),
    ungraded: result.ungraded.map(idOf),
    solo: result.solo.map(idOf),
    conflictSplits: result.conflictSplits,
    counts: result.counts,
  };
}
