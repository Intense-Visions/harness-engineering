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

export { springPhysicsPattern } from './spring-physics.js';
export { skeletonContentMatchedPattern } from './skeleton-content-matched.js';
export { staggerTimingPattern } from './stagger-timing.js';
export { pageTransitionCrossfadePattern } from './page-transition-crossfade.js';
export { fluidTypeScalePattern } from './fluid-type-scale.js';

/**
 * Phase 2 seed polish patterns. The earlier Phase 2 increment anchored
 * the schema with spring-physics (CRAFT-P001); a subsequent slice widened
 * the seed to three by adding skeleton-content-matched (P002) and
 * stagger-timing (P003). This commit widens to five by adding
 * page-transition-crossfade (P004 — closes the v1 motion sub-category to
 * its target of 3) and fluid-type-scale (P005 — opens the typography
 * sub-category). Subsequent commits extend toward the full 15-pattern
 * seed (3 motion + 3 skeleton + 3 typography + 3 interaction + 3 layout)
 * per success criterion #8.
 *
 * The widened seed deliberately spreads across tier × impact pairs the
 * 3-axis model can express:
 *   - polish × medium: P001 spring-physics
 *   - polish × large: P002 skeleton-content-matched, P005 fluid-type-scale
 *   - polish × small: P003 stagger-timing
 *   - foundational × medium: P004 page-transition-crossfade
 * The POLISH loop now exercises the foundational tier alongside polish,
 * proving that pattern catalogues cover both structural baseline craft
 * and finishing-move elevation.
 *
 * Order matters: CRAFT-P001/002/003/004/005 align to the array order so
 * finding listings and the markdown formatter render patterns in a stable
 * sequence.
 */
export const SEED_PATTERNS: readonly PatternDefinition[] = [
  springPhysicsPattern,
  skeletonContentMatchedPattern,
  staggerTimingPattern,
  pageTransitionCrossfadePattern,
  fluidTypeScalePattern,
];
