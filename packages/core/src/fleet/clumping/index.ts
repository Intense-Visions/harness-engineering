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
// Phase 1 shipped the primitive. Phase 3 bound creation, Phase 4 intake, and
// Phase 5 execution — `dispatch.ts` carries the one-PR-per-clump contract and
// D10's one-verdict-per-clump drop semantics as callables, because the four
// members whose lane unit a clump becomes are SKILL.md files with no code
// behind their DISPATCH.

export { resolveFloor, resolveClumpPolicy, DEFAULT_CLUMP_POLICY } from './floor';
export { formClumps } from './form';
export { planClumpPR, settleClumpVerdict, checkVerdictPartition } from './dispatch';
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
export type {
  ClumpCommit,
  ClumpDrop,
  ClumpMemberOutcome,
  ClumpPRPlan,
  ClumpPlanOptions,
  ClumpVerdict,
  ClumpVerdictOptions,
  PostDropBuild,
} from './dispatch';
