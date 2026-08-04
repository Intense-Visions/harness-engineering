// packages/cli/src/design-craft/catalog/rubrics/concept-coherence.ts
//
// CRAFT-C011 — first page-scoped rubric. Opens the marketing-page tier of
// the critique surface (finding-codes.md, C011–C020 growth band; ADR 0082).
// Pairs with composition-art-direction (CRAFT-C012) and
// surface-texture-material (CRAFT-C013) so page-scoped targets are judged
// on direction — concept, composition, material — not component polish.

import type { RubricDefinition } from './hierarchy-clarity.js';

export const conceptCoherenceRubric: RubricDefinition = {
  id: 'rubric-concept-coherence',
  name: 'Concept Coherence',
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
    'Evaluate the concept coherence of {target}.',
    '',
    'Source under review:',
    '```',
    '{source}',
    '```',
    '',
    '- Is there ONE nameable idea the whole page argues — could you state it',
    '  in a sentence — or is the page a sequence of sections with no thesis?',
    '- Can each section cite the concept? Walk the sections: does each one',
    "  advance the idea, or would it fit unchanged on any competitor's site?",
    '- Do palette, typography, motif, and voice argue the SAME thing, or do',
    '  they pull in different directions (playful type over corporate copy,',
    '  brutalist grid under decorative gradients)?',
    '- Is the concept derived from the subject (place, trade, product,',
    '  history) or is it a generic aesthetic applied from outside?',
    '- Could a stranger use the concept to REJECT a nonconforming section',
    '  design? A concept that can only approve is decoration, not direction.',
    '',
    'Use the 3-axis output model (tier x impact x confidence). Concept reads',
    'well from markup + copy + declared tokens, so confidence can stay high',
    'in fast/code-only mode; drop it when the concept would only be visible',
    'in rendered imagery.',
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
    'A construction-company page whose "ledger of ground moved" concept',
    'shows up as tabular credentials typography, an earth-tone two-color',
    'world, and section headings that count work done — every section',
    'cites the idea.',
  ].join('\n'),
  negativeExample: [
    'A template page — hero + three feature cards + testimonial ribbon +',
    'CTA band — where swapping the logo and copy to a different company',
    'changes nothing; palette says "trust blue," voice says "playful,"',
    'grid says "SaaS."',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-C011',
    tier: 'foundational',
    impact: 'large',
    phase: 'critique',
  },
};
