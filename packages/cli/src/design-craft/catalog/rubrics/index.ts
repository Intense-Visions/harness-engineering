// packages/cli/src/design-craft/catalog/rubrics/index.ts
//
// Barrel for the seed of critique rubrics. Re-exports the canonical
// `RubricDefinition` type plus every authored seed entry.
//
// Order matters: CRAFT-C001..C007 align to the array order so finding
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
import { restraintRubric } from './restraint.js';
import { polishDetailsRubric } from './polish-details.js';

export { hierarchyClarityRubric } from './hierarchy-clarity.js';
export { typographyCraftRubric } from './typography-craft.js';
export { motionQualityRubric } from './motion-quality.js';
export { colorConfidenceRubric } from './color-confidence.js';
export { densityRhythmRubric } from './density-rhythm.js';
export { restraintRubric } from './restraint.js';
export { polishDetailsRubric } from './polish-details.js';

/**
 * Seed critique rubrics. Phase 1 shipped one (hierarchy-clarity);
 * Phase 2 widened to three (adding typography + motion); a subsequent
 * slice widened to five (adding color-confidence + density-rhythm); this
 * slice widens to seven by authoring the first two of the Phase 2B
 * widen-to-10 set (restraint + polish-details). The remaining three
 * (copy-voice, interaction-craft, brand-coherence) land in a follow-up
 * to close the v1 seed at success criterion #7's target of 10.
 *
 * The widen-to-seven set deliberately mixes tiers: C001/C004/C006 anchor
 * the foundational × large band, C002/C005/C007 spread across the
 * foundational/polish × medium band, and C003 sits at foundational ×
 * medium. The CRITIQUE loop now exercises both axes meaningfully.
 */
export const SEED_RUBRICS: readonly RubricDefinition[] = [
  hierarchyClarityRubric,
  typographyCraftRubric,
  motionQualityRubric,
  colorConfidenceRubric,
  densityRhythmRubric,
  restraintRubric,
  polishDetailsRubric,
];
