// packages/cli/src/design-craft/catalog/rubrics/composition-art-direction.ts
//
// CRAFT-C012 — second page-scoped rubric of the marketing-page tier
// (finding-codes.md, C011–C020 growth band; ADR 0082). Judges per-section
// compositional variety, licensed grid-breaking, and whitespace confidence
// across a whole page — the cross-section craft component-scoped rubrics
// cannot see.

import type { RubricDefinition } from './hierarchy-clarity.js';

export const compositionArtDirectionRubric: RubricDefinition = {
  id: 'rubric-composition-art-direction',
  name: 'Composition & Art Direction',
  version: 1,
  status: 'stable',
  authoredAt: '2026-08-03',
  contributors: ['@chadjw'],
  appliesTo: ['page'],
  source: {
    ref: 'awwwards#evaluation-criteria',
    url: 'https://www.awwwards.com/about-evaluation/',
  },
  prompt: [
    'Evaluate the composition and art direction of {target}.',
    '',
    'Source under review:',
    '```',
    '{source}',
    '```',
    '',
    '- Does each section have its own compositional idea, or does the page',
    '  repeat the same-shaped card/grid pattern down its full length?',
    '- Is there an underlying grid AND licensed ways of breaking it —',
    '  overlap, asymmetry bias, full-bleed moments, deliberate whitespace',
    '  scale — or is every element boxed and center-aligned?',
    '- Is whitespace confident (generous where the content earns it, used',
    '  as a compositional element) or uniform padding applied everywhere?',
    '- Do inner surfaces hold the same compositional standard as the hero,',
    '  or does craft decay after the first viewport?',
    '- Do scale contrasts (display type vs body, large imagery vs small',
    '  annotations) create rhythm across sections?',
    '',
    'Use the 3-axis output model (tier x impact x confidence). Grid CSS,',
    'section markup, and spacing tokens are visible from code; rendered',
    'composition is not — drop confidence in fast/code-only mode when the',
    'judgment depends on how the layout actually resolves.',
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
    'A page that alternates full-bleed type moments, an offset two-column',
    'ledger, and an overlapping image/heading break — same grid',
    'underneath, three licensed breaks, whitespace doubling at act',
    'boundaries.',
  ].join('\n'),
  negativeExample: [
    'Five sections of identical three-up cards in identical containers',
    'with identical 64px padding; the only compositional variable is the',
    'background color of alternate bands.',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-C012',
    tier: 'foundational',
    impact: 'large',
    phase: 'critique',
  },
};
