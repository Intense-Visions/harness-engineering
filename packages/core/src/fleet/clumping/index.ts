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
// behind their DISPATCH. Phase 6 added `config.ts` — the `clumping` block of
// harness.config.json and the per-seam policy resolution the three seams read,
// held in core because the review seam IS core code.

export {
  resolveFloor,
  resolveClumpPolicy,
  overlayClumpPolicy,
  DEFAULT_CLUMP_POLICY,
} from './floor';
export {
  ClumpingConfigSchema,
  clumpingFromConfig,
  reportIgnoredClumpingBlock,
  resolveSeamClumpPolicy,
} from './config';
export type { ClumpingConfig, ClumpSeam } from './config';
export { formClumps } from './form';
export { scopeOfPath } from './scope';
export { withOrdinals } from './ordinals';
export { toClumpView } from './view';
export { planClumpPR, settleClumpVerdict, checkVerdictPartition } from './dispatch';
export type {
  Clump,
  ClumpCounts,
  ClumpPolicy,
  ClumpResult,
  ClumpableItem,
  FloorContext,
  FloorVerdict,
  ClumpMemberView,
  ClumpUnitView,
  ClumpView,
  FlooredItem,
  FlooredItemView,
  Grade,
} from './types';
export type { Numbered } from './ordinals';
export type { ClumpPolicyOverlay } from './floor';
export type {
  ClumpCommit,
  ClumpDrop,
  ClumpMemberOutcome,
  ClumpPRPlan,
  ClumpPlanOptions,
  ClumpVerdict,
  ClumpVerdictOptions,
  PlannableClump,
  PlannableMember,
  PostDropBuild,
} from './dispatch';
