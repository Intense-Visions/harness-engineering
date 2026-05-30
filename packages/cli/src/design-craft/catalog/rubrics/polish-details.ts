// packages/cli/src/design-craft/catalog/rubrics/polish-details.ts
//
// Seventh seed rubric — second of the Phase 2B widen-to-10 pair (C006
// restraint + C007 polish-details). Together with restraint, these rubrics
// shift the loop from foundational-structural questions (hierarchy, color,
// density) to polish-tier craft questions (what's missing AFTER the
// foundation is right). The polish-details rubric is the explicit cousin
// of the CRAFT-P* polish patterns — where the patterns prescribe the
// high-craft moves to APPLY, this rubric asks whether such moves have
// been considered at all.
//
// CRAFT-C007 — Polish Details. Polish × medium pair on the finishing-
// touches dimension. Sourced from emil-design-eng#polish-checklist +
// stripe-press#detail-work. The rubric asks whether the seams have been
// sanded — focus states, empty/error/loading boundaries, optical
// alignment, edge-case copy — or whether the surface is "first draft"
// shipping.
//
// Honors:
//   - ADR 0019: tier × impact × confidence preserved verbatim from the LLM.
//   - ADR 0020: id/version/status/authoredAt/contributors/source.ref required.

import type { RubricDefinition } from './hierarchy-clarity.js';

export const polishDetailsRubric: RubricDefinition = {
  id: 'rubric-polish-details',
  name: 'Polish Details',
  version: 1,
  status: 'stable',
  authoredAt: '2026-05-30',
  contributors: ['@chadjw'],
  appliesTo: ['component', 'page'],
  source: {
    ref: 'emil-design-eng#polish-checklist + stripe-press#detail-work',
    url: 'https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md',
  },
  prompt: [
    'Evaluate the polish details of {target}.',
    '',
    'Source under review:',
    '```',
    '{source}',
    '```',
    '',
    '- Are focus states visible, distinct from hover, and consistent',
    '  across interactive elements — or is `outline: none` shipping with',
    '  no replacement?',
    '- Are empty, loading, and error states modelled, or does the',
    '  component only render the happy path?',
    '- Are interactive elements optically aligned (icon-to-baseline,',
    '  glyph-to-button-center) rather than mathematically aligned by',
    '  bounding box?',
    '- Are corner radii consistent within their nesting context (outer',
    '  radius > inner radius by the gap, not arbitrary), or do nested',
    '  rounded shapes fight each other?',
    '- Are transitions tuned (not the default `transition: all 0.3s`),',
    '  including the disabled-vs-enabled flip, the hover settle, and',
    '  the active press?',
    '- Is the keyboard story complete — tab order sensible, Escape',
    '  closes overlays, Enter activates default action, Arrow keys',
    '  navigate where appropriate?',
    '- Are the copy edges polished — error messages specific and',
    '  actionable, empty states inviting rather than dead, button labels',
    '  in active voice ("Save changes" not "Submit")?',
    '',
    'Use the 3-axis output model (tier x impact x confidence). Many polish',
    'details (focus rings, state coverage, copy tone) are visible from',
    'code; some (optical alignment, motion-tuning quality) need rendering.',
    'Confidence should drop on the latter in fast/code-only mode.',
    '',
    'Respond with a single fenced ```json``` block containing an object:',
    '{',
    '  "tier": "foundational" | "polish" | "aspirational",',
    '  "impact": "small" | "medium" | "large",',
    '  "confidence": "high" | "medium" | "low",',
    '  "message": "<one-paragraph critique of what you see>"',
    '}',
  ].join('\n'),
  positiveExample: [
    'Stripe payment form — focus ring is a 2px offset indigo outline,',
    'distinct from the 1px hover border. Empty state ("No saved cards")',
    'invites action with a single ghost CTA; loading state renders a',
    'content-matched skeleton, not a spinner; the field-level error sits',
    'inline with a specific message ("This card is expired — try another").',
    'Outer card radius is 12, inner button radius is 8, the gap is right.',
    'Tab order follows visual order; Escape closes the modal.',
  ].join('\n'),
  negativeExample: [
    'Settings dialog ships with `outline: none` on every interactive',
    'element and no replacement focus ring. The "Save" button has a',
    '`transition: all 0.3s` so even the cursor-color change wobbles.',
    'No empty state — when the list is empty, the dialog shows a flat',
    'grey rectangle with the word "Empty." Error case is a red banner',
    'reading "Error: failed to save (500)". Outer card radius 16, inner',
    'button radius 16, the inner shape protrudes the outer at every',
    'corner. No Escape handler.',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-C007',
    tier: 'polish',
    impact: 'medium',
    phase: 'critique',
  },
};
