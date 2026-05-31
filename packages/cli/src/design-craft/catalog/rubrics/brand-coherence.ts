// packages/cli/src/design-craft/catalog/rubrics/brand-coherence.ts
//
// Tenth seed rubric — third of the Phase 2C widen-to-10 triple (C008
// copy-voice + C009 interaction-craft + C010 brand-coherence). Closes
// SC #7 (10 critique rubrics in the v1 seed); the SEED_RUBRICS array
// now matches the spec target and the catalog-seed test's count
// assertion bumps from 7 to 10 in lockstep.
//
// CRAFT-C010 — Brand Coherence. Foundational × large pair on the
// cross-surface identity dimension. Sourced from stripe-press#consistency
// + linear-brand#presence. Where audit-brand-compliance (#3) enforces
// declared brand rules from DESIGN.md, this rubric asks the upstream
// craft question — does this surface FEEL like the same product as the
// company's other surfaces, or like a stranger wearing the company's
// logo? Brand coherence is the test the rule-based audit cannot make.
//
// Honors:
//   - ADR 0019: tier × impact × confidence preserved verbatim from the LLM.
//   - ADR 0020: id/version/status/authoredAt/contributors/source.ref required.

import type { RubricDefinition } from './hierarchy-clarity.js';

export const brandCoherenceRubric: RubricDefinition = {
  id: 'rubric-brand-coherence',
  name: 'Brand Coherence',
  version: 1,
  status: 'stable',
  authoredAt: '2026-05-30',
  contributors: ['@chadjw'],
  appliesTo: ['component', 'page'],
  source: {
    ref: 'stripe-press#consistency + linear-brand#presence',
    url: 'https://stripe.press/',
  },
  prompt: [
    'Evaluate the brand coherence of {target}.',
    '',
    'Source under review:',
    '```',
    '{source}',
    '```',
    '',
    '- Does the surface read like the same product family as the',
    "  company's other surfaces (marketing, docs, dashboard, mobile) —",
    '  same typographic register, same color personality, same density',
    '  rhythm — or does it feel like a different team shipped it?',
    '- Is the visual identity load-bearing (color used to mean something,',
    '  typography setting a tone, motion expressing a character) or is',
    '  it generic-template tier where any logo would fit in the corner?',
    '- Does interactive moment-by-moment feel match the brand — playful',
    '  surfaces use playful motion, serious surfaces use restrained',
    '  motion — or is the motion library a default with no point of view?',
    '- Are the visual flourishes that DO appear (illustrations, icons,',
    '  accent shapes) drawn from a coherent system, or do they feel like',
    '  stock pieces assembled from different libraries?',
    '- If someone screenshotted this surface with the logo removed,',
    '  would another team in the company recognize it as theirs?',
    '- Is the surface confident about its identity (committing to a',
    '  point of view) or does it hedge with generic-modern-SaaS choices',
    '  to avoid alienating anyone?',
    '',
    'Use the 3-axis output model (tier x impact x confidence). Brand',
    'coherence reads partially from code (color/font/spacing token usage,',
    'icon-library imports) and partially from rendered output (motion',
    'character, illustration choice, visual rhythm across regions).',
    'Confidence should reflect which signals are available — full',
    'judgments are deep-mode territory; fast-mode judgments anchor on',
    'token usage and component composition.',
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
    'Linear settings page — same typographic scale as the issue view,',
    'same restrained motion library (no easter-egg flourishes), same',
    'monochromatic palette with the single brand accent reserved for the',
    'active row. Icons are drawn from the same custom set as the rest of',
    'the product. With the logo removed, a Linear user would still know',
    'it was Linear from the first glance.',
  ].join('\n'),
  negativeExample: [
    "A startup's in-product billing page that imports a different icon",
    'library than the rest of the app, uses a system font where every',
    'other surface uses the custom display face, lays out cards in a',
    'three-column grid where the rest of the product uses generous',
    'single-column flows, and reaches for a stock illustration of two',
    'people high-fiving above the "Plans" header. The screenshot, logo',
    'removed, could belong to any of a hundred companies.',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-C010',
    tier: 'foundational',
    impact: 'large',
    phase: 'critique',
  },
};
