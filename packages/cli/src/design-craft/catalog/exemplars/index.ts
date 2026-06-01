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

export { linearEmptyListExemplar } from './linear-empty-list.js';
export { stripeLoadingStateExemplar } from './stripe-loading-state.js';
export { raycastCommandPaletteExemplar } from './raycast-command-palette.js';
export { vercelErrorStateExemplar } from './vercel-error-state.js';
export { linearIssueModalExemplar } from './linear-issue-modal.js';
export { stripePayButtonExemplar } from './stripe-pay-button.js';

/**
 * Seed exemplars. The earlier Phase 2 increment anchored the shape with
 * Linear's empty list (EmptyState); the catalog-widen commit added Stripe
 * loading + Raycast command palette to bring BENCHMARK to three component
 * types; the B004 / B005 widen added Vercel error state + Linear issue
 * modal to cover five component types. This increment closes the
 * CRAFT-B006 reservation from `finding-codes.md` by porting in Stripe's
 * Pay button (Button) — the last unclaimed canonical componentType — so
 * the BENCHMARK loop now covers all five canonical component types the
 * spec calls out for the 50-exemplar plan: EmptyState, LoadingState,
 * ErrorState, Modal, Button (plus the informal CommandPalette anchor).
 * The full 50-exemplar seed (10 per type for 5 canonical types) grows
 * horizontally from here per the spec.
 *
 * Order matters: anchors land in landing order so anchor codes
 * (CRAFT-B001..B006) align with the array index.
 */
export const SEED_EXEMPLARS: readonly ExemplarDefinition[] = [
  linearEmptyListExemplar,
  stripeLoadingStateExemplar,
  raycastCommandPaletteExemplar,
  vercelErrorStateExemplar,
  linearIssueModalExemplar,
  stripePayButtonExemplar,
];
