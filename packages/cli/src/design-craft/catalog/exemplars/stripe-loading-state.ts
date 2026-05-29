// packages/cli/src/design-craft/catalog/exemplars/stripe-loading-state.ts
//
// Phase 2 catalog increment — second exemplar. Ported from the Phase 0 paper
// spike:
//   docs/changes/design-pipeline/design-craft-elevator/phase-0-schema-spike/
//   exemplars/stripe-loading-state.md
//
// Anchors the LoadingState component type for BENCHMARK scoring — a peer to
// Linear's EmptyState exemplar. Together they let BENCHMARK fan out across
// at least two component types in v1.
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.

import type { ExemplarDefinition } from './linear-empty-list.js';

export const stripeLoadingStateExemplar: ExemplarDefinition = {
  id: 'exemplar-stripe-loading-state',
  name: 'Stripe Loading State',
  componentType: 'LoadingState',
  version: 1,
  status: 'stable',
  url: 'https://stripe.com/payments',
  authoredAt: '2026-05-23',
  contributors: ['@chadjw'],
  source: {
    ref: 'stripe-checkout',
    url: 'https://docs.stripe.com/elements/appearance-api',
  },
  critique: [
    'Hierarchy: skeleton mirrors the about-to-appear layout precisely —',
    'same row count, same column widths within ~10%, same spatial',
    'rhythm. The eye sees the destination layout immediately and does',
    'not need to re-orient when real content arrives.',
    'Typography: skeleton bars are sized to match expected text widths',
    '(a header bar is wider than a metadata bar), reinforcing the',
    'hierarchy preview.',
    'Visual: gentle gradient shimmer (1.2s cycle, 30deg sweep, low',
    'contrast against the muted fill). Shimmer is suppressed under',
    '`prefers-reduced-motion`, replaced by static muted fill.',
    'Density: skeleton respects the same vertical rhythm as the loaded',
    'state — no layout shift when content swaps in.',
    'Motion: shimmer is subtle enough to read as "loading" without',
    'becoming distracting. Skeleton cross-fades into real content over',
    '~180ms (no jarring snap).',
  ].join('\n'),
  whyExemplar: [
    'Demonstrates content-matched skeleton (vs generic spinner) at',
    'production quality. The exemplar teaches that loading is a UI',
    'state worth designing, not a fallback to apologize for. Layout',
    'preservation between skeleton and loaded state is the high-craft',
    'move most competitors miss — they show a centered spinner that',
    'gives no preview, then dump content into a fresh layout.',
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 88,
    hierarchy: 85,
    craftExecution: 94,
    function: 92,
    innovation: 75,
  },
  citationCount: 0,
};
