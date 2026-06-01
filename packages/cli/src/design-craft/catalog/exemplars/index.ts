// packages/cli/src/design-craft/catalog/exemplars/index.ts
//
// Barrel for the Phase 2 seed of exemplars.

export type { ExemplarDefinition, RadarReference, ComponentType } from './linear-empty-list.js';

import type { ExemplarDefinition } from './linear-empty-list.js';
import { linearEmptyListExemplar } from './linear-empty-list.js';
import { stripeLoadingStateExemplar } from './stripe-loading-state.js';
import { raycastCommandPaletteExemplar } from './raycast-command-palette.js';
import { vercelErrorStateExemplar } from './vercel-error-state.js';
import { linearIssueModalExemplar } from './linear-issue-modal.js';
import { stripePayButtonExemplar } from './stripe-pay-button.js';
import { notionEmptyDatabaseExemplar } from './notion-empty-database.js';
import { vercelBuildProgressExemplar } from './vercel-build-progress.js';

export { linearEmptyListExemplar } from './linear-empty-list.js';
export { stripeLoadingStateExemplar } from './stripe-loading-state.js';
export { raycastCommandPaletteExemplar } from './raycast-command-palette.js';
export { vercelErrorStateExemplar } from './vercel-error-state.js';
export { linearIssueModalExemplar } from './linear-issue-modal.js';
export { stripePayButtonExemplar } from './stripe-pay-button.js';
export { notionEmptyDatabaseExemplar } from './notion-empty-database.js';
export { vercelBuildProgressExemplar } from './vercel-build-progress.js';

/**
 * Seed exemplars. The earlier Phase 2 increment anchored the shape with
 * Linear's empty list (EmptyState); the catalog-widen commit added Stripe
 * loading + Raycast command palette to bring BENCHMARK to three component
 * types; the B004 / B005 widen added Vercel error state + Linear issue
 * modal to cover five component types; the B006 widen added Stripe's Pay
 * button to anchor the Button componentType so the BENCHMARK loop covers
 * every canonical componentType the spec calls out for the 50-exemplar
 * plan: EmptyState, LoadingState, ErrorState, Modal, Button (plus the
 * informal CommandPalette anchor).
 *
 * This increment opens the HORIZONTAL GROWTH phase of the seed by adding
 * a second EmptyState anchor (Notion empty database — INSTRUCTIONAL
 * register, CRAFT-B007) and a second LoadingState anchor (Vercel build
 * progress — NARRATIVE register, CRAFT-B008). Together with the existing
 * Linear (RESOLVED EmptyState) and Stripe (PREVIEW LoadingState) anchors,
 * BENCHMARK can now score targets against the right tonal model rather
 * than collapsing every EmptyState / LoadingState toward a single
 * register. The full 50-exemplar seed (10 per type for 5 canonical types)
 * grows horizontally from here per the spec.
 *
 * Order matters: anchors land in landing order so anchor codes
 * (CRAFT-B001..B008) align with the array index.
 */
export const SEED_EXEMPLARS: readonly ExemplarDefinition[] = [
  linearEmptyListExemplar,
  stripeLoadingStateExemplar,
  raycastCommandPaletteExemplar,
  vercelErrorStateExemplar,
  linearIssueModalExemplar,
  stripePayButtonExemplar,
  notionEmptyDatabaseExemplar,
  vercelBuildProgressExemplar,
];
