// packages/cli/src/design-craft/catalog/patterns/index.ts
//
// Barrel for the Phase 2 seed of polish patterns. Mirrors the rubrics
// barrel structure so the orchestrator can load the catalog in a single
// shape regardless of which phase consumes it.

export type { PatternDefinition, PatternApplicability } from './spring-physics.js';

import type { PatternDefinition } from './spring-physics.js';
import { springPhysicsPattern } from './spring-physics.js';
import { skeletonContentMatchedPattern } from './skeleton-content-matched.js';
import { staggerTimingPattern } from './stagger-timing.js';
import { progressiveCornerRoundingPattern } from './progressive-corner-rounding.js';
import { focusRingCraftPattern } from './focus-ring-craft.js';

export { springPhysicsPattern } from './spring-physics.js';
export { skeletonContentMatchedPattern } from './skeleton-content-matched.js';
export { staggerTimingPattern } from './stagger-timing.js';
export { progressiveCornerRoundingPattern } from './progressive-corner-rounding.js';
export { focusRingCraftPattern } from './focus-ring-craft.js';

/**
 * Phase 2 seed polish patterns. The earlier Phase 2 increment anchored
 * the schema with spring-physics (CRAFT-P001) and widened to three with
 * skeleton-content-matched + stagger-timing (CRAFT-P002 / P003). This
 * increment opens two more sub-categories of the 15-pattern v1 target:
 * layout (progressive-corner-rounding, CRAFT-P006) and interaction
 * (focus-ring-craft, CRAFT-P007). Remaining gap: P008-P015 (2 more
 * layout + 2 more interaction + 2 more typography + 2 more skeleton).
 *
 * Order matters: CRAFT-P001..P007 align to the array order so finding
 * listings and the markdown formatter render patterns in a stable
 * sequence.
 *
 * Note on P004/P005: those codes are reserved for the third motion
 * pattern (page-transition-crossfade) and the first typography pattern
 * (fluid-type-scale) being shipped in parallel; the array order matches
 * the code order even when the corresponding files land out-of-band.
 */
export const SEED_PATTERNS: readonly PatternDefinition[] = [
  springPhysicsPattern,
  skeletonContentMatchedPattern,
  staggerTimingPattern,
  progressiveCornerRoundingPattern,
  focusRingCraftPattern,
];
