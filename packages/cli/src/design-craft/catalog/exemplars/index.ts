// packages/cli/src/design-craft/catalog/exemplars/index.ts
//
// Barrel for the Phase 2 seed of exemplars.

export type { ExemplarDefinition, RadarReference, ComponentType } from './linear-empty-list.js';

import type { ExemplarDefinition } from './linear-empty-list.js';
import { linearEmptyListExemplar } from './linear-empty-list.js';
import { stripeLoadingStateExemplar } from './stripe-loading-state.js';
import { raycastCommandPaletteExemplar } from './raycast-command-palette.js';

export { linearEmptyListExemplar } from './linear-empty-list.js';
export { stripeLoadingStateExemplar } from './stripe-loading-state.js';
export { raycastCommandPaletteExemplar } from './raycast-command-palette.js';

/**
 * Phase 2 seed exemplars. The earlier Phase 2 increment anchored the
 * shape with Linear's empty list (EmptyState); this commit widens the
 * seed to three so BENCHMARK fans out across three component types in
 * v1 (EmptyState, LoadingState, CommandPalette). The full 50-exemplar
 * seed (10 per type × 5 types) grows from here per the spec.
 *
 * Order matters: anchors LoadingState and CommandPalette next to
 * EmptyState so test snapshots, finding listings, and dashboard stats
 * render in a stable sequence.
 */
export const SEED_EXEMPLARS: readonly ExemplarDefinition[] = [
  linearEmptyListExemplar,
  stripeLoadingStateExemplar,
  raycastCommandPaletteExemplar,
];
