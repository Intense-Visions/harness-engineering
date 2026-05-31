// packages/cli/src/design-craft/catalog/exemplars/stripe-pay-button.ts
//
// Phase 2 catalog increment — sixth exemplar. Closes the CRAFT-B006
// reservation called out in finding-codes.md (Button anchor for the early
// v1 exemplar set), and completes the five canonical componentTypes the
// spec calls out for the 50-exemplar plan: EmptyState / LoadingState /
// ErrorState / Modal / Button (plus the informal CommandPalette anchor).
// With this entry, every canonical componentType is anchored by at least
// one exemplar and the catalog can now grow horizontally (more exemplars
// per type) without needing to introduce new types first.
//
// Stripe's Pay button is the anchor because it is the canonical reference
// for a high-craft primary CTA on a payment surface — a place where the
// stakes for craft are unusually high (a single click commits real money),
// the cross-product variance is unusually wide (every checkout in the
// world ships a Pay button, most of them mediocre), and the public
// documentation is unusually thorough (Stripe Elements appearance API
// codifies the design tokens; Stripe Press has written publicly about
// the button's polish details). The button reads as the focal action of
// the surface without shouting — the hierarchy / restraint / interaction
// craft combination is the lesson.
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.

import type { ExemplarDefinition } from './linear-empty-list.js';

export const stripePayButtonExemplar: ExemplarDefinition = {
  id: 'exemplar-stripe-pay-button',
  name: 'Stripe Pay Button',
  componentType: 'Button',
  version: 1,
  status: 'stable',
  url: 'https://stripe.com/payments/checkout',
  authoredAt: '2026-05-31',
  contributors: ['@chadjw'],
  source: {
    ref: 'stripe-checkout#pay-button',
    url: 'https://docs.stripe.com/elements/appearance-api',
  },
  critique: [
    'Hierarchy: the Pay button is the single focal action of the surface',
    '— full-width on mobile, comfortable-width on desktop, set in the',
    'primary brand token at a contrast that reads from peripheral vision.',
    'Adjacent secondary actions (back, change payment method) sit in a',
    'reduced weight + reduced saturation register so the Pay action wins',
    'unambiguously. The amount renders inside the label ("Pay $42.18")',
    'so the commit value is part of the action, not buried elsewhere.',
    'Typography: label in reading weight (not bold) at a settled size,',
    'tracked tight, with the currency + amount integrated as a single',
    'phrase rather than two separate runs. Numerals use tabular figures',
    'so the amount does not shift width on update. No all-caps shouting,',
    'no exclamation marks, no marketing voice on the label.',
    'Visual: a single rounded rectangle in the brand token with one',
    'border that resolves to the same token at slightly lower lightness —',
    'no gradients, no inner shadows, no decorative shine. The corner',
    'radius matches the form-field radius above it for visual rhythm.',
    'The icon (if present, e.g., Apple Pay / Google Pay glyph) sits to',
    'the left of the label with optical alignment, not pixel-center.',
    "Density: comfortable internal padding — the label doesn't crowd",
    'the edges, and the button has a tap target that exceeds the WCAG',
    'minimum without feeling oversized. Vertical rhythm with the form',
    'above is locked: the gap between the last form field and the Pay',
    'button matches the gap between form-field groups, not larger.',
    'Motion: hover transitions over ~120ms to a darkened-by-one-step',
    'background using the same brand token + alpha overlay (not a',
    'different color); press settles instantly with a 1px translate-y or',
    'a brightness drop, not a scale wobble; loading swaps the label for',
    'an in-place spinner without resizing the button (layout-locked).',
    'Disabled state desaturates the token rather than greying out, so the',
    'button still reads as the primary action that just is not yet',
    'eligible. Reduced-motion respects: the press feedback degrades to',
    'an opacity step.',
    'Interaction: focus uses the three-layer ring pattern documented as',
    '`CRAFT-P007` (focus-ring-craft) — brand-token accent + outline-',
    'offset + soft halo — paired with `:focus-visible` so pointer clicks',
    'never trigger the ring. Enter and Space activate; the active state',
    'persists through the round trip so the user has unambiguous',
    'feedback that the click registered.',
    'Copy: the label names the action and the amount together ("Pay',
    '$42.18", "Subscribe for $9/month") so the user commits to a',
    'specific transaction rather than a generic verb. Error recovery on',
    'the button surface ("Card declined — try another card") follows the',
    'same calm forensic register as the Vercel error exemplar.',
  ].join('\n'),
  whyExemplar: [
    'Demonstrates the high-craft primary CTA pattern most product buttons',
    'fail: (1) the label carries the commit value so the action is',
    'specific, not generic; (2) the visual treatment is one token + one',
    'border, not a gradient + shadow + shine stack; (3) the hover / press',
    '/ loading / disabled / focus states are all on a single rhythm',
    'rather than five disconnected treatments; (4) the focus ring uses',
    'the three-layer pattern paired with `:focus-visible`, respecting',
    'both keyboard users and pointer users; (5) the loading state is',
    'layout-locked so the surface does not jitter mid-transaction. Most',
    'competing Pay / Buy / Submit buttons fall into at least three of',
    'these traps (generic "Pay now" label divorced from the amount, a',
    'gradient + drop shadow + bevel pile, hover that changes the color',
    'family, focus rings that fight the brand or do not appear at all,',
    "loading spinners that reflow the button width). Stripe's Pay button",
    'is the proof point that "stunning" at the Button componentType means',
    '"every state is doing intentional work" rather than "more visual',
    'effect." The exemplar composes naturally with `CRAFT-C001`',
    '(hierarchy — Pay wins as the focal action), `CRAFT-C006` (restraint',
    '— one token, no gradient pile), `CRAFT-C007` (polish-details — the',
    'state rhythm), `CRAFT-C009` (interaction craft — focus + active +',
    'loading), `CRAFT-P001` (spring-physics — the press feedback), and',
    '`CRAFT-P007` (focus-ring-craft — the three-layer ring).',
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 93,
    hierarchy: 95,
    craftExecution: 94,
    function: 96,
    innovation: 75,
  },
  citationCount: 0,
};
