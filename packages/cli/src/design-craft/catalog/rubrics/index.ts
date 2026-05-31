// packages/cli/src/design-craft/catalog/rubrics/index.ts
//
// Barrel for the seed of critique rubrics. Re-exports the canonical
// `RubricDefinition` type plus every authored seed entry.
//
// Order matters: CRAFT-C001..C010 align to the array order so finding
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
import { copyVoiceRubric } from './copy-voice.js';
import { interactionCraftRubric } from './interaction-craft.js';
import { brandCoherenceRubric } from './brand-coherence.js';

export { hierarchyClarityRubric } from './hierarchy-clarity.js';
export { typographyCraftRubric } from './typography-craft.js';
export { motionQualityRubric } from './motion-quality.js';
export { colorConfidenceRubric } from './color-confidence.js';
export { densityRhythmRubric } from './density-rhythm.js';
export { restraintRubric } from './restraint.js';
export { polishDetailsRubric } from './polish-details.js';
export { copyVoiceRubric } from './copy-voice.js';
export { interactionCraftRubric } from './interaction-craft.js';
export { brandCoherenceRubric } from './brand-coherence.js';

/**
 * Seed critique rubrics. Phase 1 shipped one (hierarchy-clarity);
 * Phase 2 widened to three (adding typography + motion); a subsequent
 * slice widened to five (adding color-confidence + density-rhythm);
 * Phase 2B widened to seven (adding restraint + polish-details); Phase 2C
 * closes the v1 seed at success criterion #7's target of 10 by adding
 * the prose-and-interaction-and-identity triple (copy-voice +
 * interaction-craft + brand-coherence).
 *
 * The closed seed deliberately spreads across every tier × impact pair
 * the 3-axis model can express:
 *   - foundational × large: C001 hierarchy, C004 color-confidence,
 *     C006 restraint, C010 brand-coherence
 *   - foundational × medium: C003 motion-quality
 *   - polish × large: C002 typography-craft, C005 density-rhythm,
 *     C009 interaction-craft
 *   - polish × medium: C007 polish-details, C008 copy-voice
 * The CRITIQUE loop now exercises every cell that matters operationally;
 * aspirational-tier rubrics enter via the contribution loop, not v1.
 */
export const SEED_RUBRICS: readonly RubricDefinition[] = [
  hierarchyClarityRubric,
  typographyCraftRubric,
  motionQualityRubric,
  colorConfidenceRubric,
  densityRhythmRubric,
  restraintRubric,
  polishDetailsRubric,
  copyVoiceRubric,
  interactionCraftRubric,
  brandCoherenceRubric,
];
