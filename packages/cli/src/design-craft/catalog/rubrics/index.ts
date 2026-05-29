// packages/cli/src/design-craft/catalog/rubrics/index.ts
//
// Barrel for the seed of critique rubrics. Re-exports the canonical
// `RubricDefinition` type plus every authored seed entry.
//
// Order matters: CRAFT-C001..C005 align to the array order so finding
// listings and the markdown formatter render rubrics in a stable sequence.

export type {
  RubricDefinition,
  RubricScope,
  CatalogSource,
  CatalogStatus,
  FindingTemplate,
} from './hierarchy-clarity.js';

import type { RubricDefinition } from './hierarchy-clarity.js';
import { hierarchyClarityRubric } from './hierarchy-clarity.js';
import { typographyCraftRubric } from './typography-craft.js';
import { motionQualityRubric } from './motion-quality.js';
import { colorConfidenceRubric } from './color-confidence.js';
import { densityRhythmRubric } from './density-rhythm.js';

export { hierarchyClarityRubric } from './hierarchy-clarity.js';
export { typographyCraftRubric } from './typography-craft.js';
export { motionQualityRubric } from './motion-quality.js';
export { colorConfidenceRubric } from './color-confidence.js';
export { densityRhythmRubric } from './density-rhythm.js';

/**
 * Seed critique rubrics. The Phase 1 vertical slice shipped only
 * `hierarchy-clarity`; Phase 2 widened to three (adding typography +
 * motion); this slice widens to five (adding color-confidence +
 * density-rhythm), hitting the Phase 1B half-seed target of 5 rubrics
 * and exercising every foundational craft dimension named in the spec's
 * seed list except the remaining 5 that land in the Phase 2B widen-to-10.
 */
export const SEED_RUBRICS: readonly RubricDefinition[] = [
  hierarchyClarityRubric,
  typographyCraftRubric,
  motionQualityRubric,
  colorConfidenceRubric,
  densityRhythmRubric,
];
