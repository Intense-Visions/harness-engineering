// packages/core/src/fleet/clumping/index.ts
//
// Clumping: the ONE mechanical floor-and-group control for the fleet spine
// (docs/changes/clumping/proposal.md). A finding below the floor is acted on rather
// than filed, and a set of like findings becomes one work item rather than N.
//
// Sibling of fleet/claims, fleet/context-budget, fleet/rate-budget and
// fleet/spend-budget — pure, offline, injected-IO-free. Seam adapters (craft,
// review, issue-fleet) live in the callers; core knows nothing about findings,
// issues or PRs.
//
// Phase 1 ships the primitive only. The three seams bind in phases 3-5.

export { resolveFloor, resolveClumpPolicy, DEFAULT_CLUMP_POLICY } from './floor';
export { formClumps } from './form';
export type {
  Clump,
  ClumpCounts,
  ClumpPolicy,
  ClumpResult,
  ClumpableItem,
  FloorContext,
  FloorVerdict,
  FlooredItem,
  Grade,
} from './types';
