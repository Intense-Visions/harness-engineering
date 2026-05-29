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

export { springPhysicsPattern } from './spring-physics.js';
export { skeletonContentMatchedPattern } from './skeleton-content-matched.js';
export { staggerTimingPattern } from './stagger-timing.js';

/**
 * Phase 2 seed polish patterns. The earlier Phase 2 increment anchored
 * the schema with spring-physics (CRAFT-P001); this commit widens the
 * seed to three so the POLISH phase exercises the pattern loop (and
 * tier × impact independence — polish × medium, polish × large, polish
 * × small). Subsequent commits extend to the full 15-pattern seed
 * (3 motion + 3 skeleton + 3 typography + 3 interaction + 3 layout)
 * per the spec.
 *
 * Order matters: CRAFT-P001/002/003 align to the array order so finding
 * listings and the markdown formatter render patterns in a stable
 * sequence.
 */
export const SEED_PATTERNS: readonly PatternDefinition[] = [
  springPhysicsPattern,
  skeletonContentMatchedPattern,
  staggerTimingPattern,
];
