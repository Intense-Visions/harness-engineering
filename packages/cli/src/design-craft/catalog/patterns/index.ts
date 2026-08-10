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
import { pageTransitionCrossfadePattern } from './page-transition-crossfade.js';
import { fluidTypeScalePattern } from './fluid-type-scale.js';
import { progressiveCornerRoundingPattern } from './progressive-corner-rounding.js';
import { focusRingCraftPattern } from './focus-ring-craft.js';
import { editorialTwoColumnSplitPattern } from './editorial-two-column-split.js';

export { springPhysicsPattern } from './spring-physics.js';
export { skeletonContentMatchedPattern } from './skeleton-content-matched.js';
export { staggerTimingPattern } from './stagger-timing.js';
export { pageTransitionCrossfadePattern } from './page-transition-crossfade.js';
export { fluidTypeScalePattern } from './fluid-type-scale.js';
export { progressiveCornerRoundingPattern } from './progressive-corner-rounding.js';
export { focusRingCraftPattern } from './focus-ring-craft.js';
export { editorialTwoColumnSplitPattern } from './editorial-two-column-split.js';

/**
 * Phase 2 seed polish patterns. The earlier Phase 2 increment anchored
 * the schema with spring-physics (CRAFT-P001); a subsequent slice widened
 * the seed to three by adding skeleton-content-matched (P002) and
 * stagger-timing (P003). A follow-up widened to five by adding
 * page-transition-crossfade (P004 — closes the v1 motion sub-category to
 * its target of 3) and fluid-type-scale (P005 — opens the typography
 * sub-category). This increment widens to seven by opening the remaining
 * two sub-categories of the 15-pattern v1 target: layout
 * (progressive-corner-rounding, CRAFT-P006) and interaction
 * (focus-ring-craft, CRAFT-P007). Remaining gap: P008-P015 (2 more
 * skeleton + 2 more typography + 2 more layout + 2 more interaction).
 *
 * The widened seed deliberately spreads across tier × impact pairs the
 * 3-axis model can express:
 *   - polish × medium: P001 spring-physics
 *   - polish × large: P002 skeleton-content-matched, P005 fluid-type-scale
 *   - polish × small: P003 stagger-timing, P006 progressive-corner-rounding
 *   - foundational × medium: P004 page-transition-crossfade
 *   - foundational × large: P007 focus-ring-craft
 * The POLISH loop now exercises the foundational tier alongside polish at
 * multiple impact levels, proving that pattern catalogues cover both
 * structural baseline craft and finishing-move elevation.
 *
 * Order matters: CRAFT-P001..P007 align to the array order so finding
 * listings and the markdown formatter render patterns in a stable
 * sequence.
 */
export const SEED_PATTERNS: readonly PatternDefinition[] = [
  springPhysicsPattern,
  skeletonContentMatchedPattern,
  staggerTimingPattern,
  pageTransitionCrossfadePattern,
  fluidTypeScalePattern,
  progressiveCornerRoundingPattern,
  focusRingCraftPattern,
  editorialTwoColumnSplitPattern,
];
