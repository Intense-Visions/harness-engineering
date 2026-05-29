// packages/cli/src/design-craft/catalog/rubrics/density-rhythm.ts
//
// Fifth seed rubric — completes the half-seed Phase 1B target of 5 rubrics
// (hierarchy, typography, motion, color, density). The rubric set now
// exercises every named foundational dimension from the spec's seed list
// except restraint / polish-details / copy-voice / interaction-craft /
// brand-coherence (those land in the Phase 2B widen to 10).
//
// CRAFT-C005 — Density & Rhythm. Foundational × medium pair on the
// spacing-and-pacing dimension. Sourced from refactoring-ui#spacing +
// linear-app#density. The rubric asks whether the surface honors a single
// spacing scale and whether the rhythm of paired vs. unpaired elements
// reads cleanly.
//
// Honors:
//   - ADR 0019: tier × impact × confidence preserved verbatim from the LLM.
//   - ADR 0020: id/version/status/authoredAt/contributors/source.ref required.

import type { RubricDefinition } from './hierarchy-clarity.js';

export const densityRhythmRubric: RubricDefinition = {
  id: 'rubric-density-rhythm',
  name: 'Density & Rhythm',
  version: 1,
  status: 'stable',
  authoredAt: '2026-05-29',
  contributors: ['@chadjw'],
  appliesTo: ['component', 'page'],
  source: {
    ref: 'refactoring-ui#spacing + linear-app#density',
    url: 'https://www.refactoringui.com/',
  },
  prompt: [
    'Evaluate the density and spacing rhythm of {target}.',
    '',
    'Source under review:',
    '```',
    '{source}',
    '```',
    '',
    '- Does the surface honor a single spacing scale (e.g. 4 / 8 / 12 /',
    '  16 / 24 / 32 / 48 / 64) or scatter arbitrary pixel margins?',
    '- Is the gap between paired elements (label + control, icon + text)',
    '  tighter than the gap to the next group, so the eye reads clusters?',
    '- Is the surface honest about its density — generous when content',
    '  rewards generosity (marketing, hero, empty states), compact when',
    '  content rewards compactness (dashboards, command palettes, tables)?',
    '- Does vertical rhythm survive at varying viewport widths, or do the',
    '  gaps collapse / explode at common breakpoints?',
    '- Are dividers earning their presence (only where whitespace alone',
    '  fails to group) or used as decorative seams?',
    '- Are sibling cards / rows / sections rhythmically spaced, or does',
    '  one out-of-scale gap break the pattern?',
    '',
    'Use the 3-axis output model (tier x impact x confidence). Confidence',
    'should drop when the target lacks a declared spacing scale to compare',
    'against, or when only inline styles are visible without surrounding',
    'layout context.',
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
    'Linear issue detail page — 4/8/16/24/32 scale used throughout, label-',
    'to-control gap is 8 while group-to-group is 24, so the eye reads',
    'pairs without effort. Dashboard rows compact at 36px, marketing hero',
    'generous at 96px — same product, honest about role. Dividers appear',
    'only between unrelated regions; everywhere else whitespace handles',
    'grouping.',
  ].join('\n'),
  negativeExample: [
    'Settings form with `margin: 14px`, `padding: 17px 21px`, and',
    '`gap: 11px` interleaved — no scale, no rhythm. Label sits 12px from',
    'its control AND 12px from the next group, so pairing collapses.',
    'Horizontal rules between every row of equal weight, plus generous',
    'whitespace on a dense list view that should be compact. Mobile gaps',
    'snap to 6px while desktop is at 32px — no continuity.',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-C005',
    tier: 'foundational',
    impact: 'medium',
    phase: 'critique',
  },
};
