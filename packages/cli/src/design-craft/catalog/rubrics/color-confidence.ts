// packages/cli/src/design-craft/catalog/rubrics/color-confidence.ts
//
// Fourth seed rubric — widens the CRITIQUE catalog beyond the three rubrics
// ported from the Phase 0 paper spike (hierarchy, typography, motion). The
// rubric set now exercises a foundational × large pair on a different
// dimension than hierarchy-clarity, so the CRITIQUE phase's rubric loop
// no longer collapses tier × impact diversity onto motion alone.
//
// CRAFT-C004 — Color Confidence. Covers the named-color dimension of the
// seed list (success criterion #7). Sourced from Refactoring UI + Geist's
// "monochrome system" stance; the rubric asks whether the surface earns its
// color choices or scatters chroma without intent.
//
// Honors:
//   - ADR 0019: tier × impact × confidence preserved verbatim from the LLM.
//   - ADR 0020: id/version/status/authoredAt/contributors/source.ref required.

import type { RubricDefinition } from './hierarchy-clarity.js';

export const colorConfidenceRubric: RubricDefinition = {
  id: 'rubric-color-confidence',
  name: 'Color Confidence',
  version: 1,
  status: 'stable',
  authoredAt: '2026-05-29',
  contributors: ['@chadjw'],
  appliesTo: ['component', 'page'],
  source: {
    ref: 'refactoring-ui#color + vercel-geist#palette',
    url: 'https://www.refactoringui.com/',
  },
  prompt: [
    'Evaluate the color confidence of {target}.',
    '',
    'Source under review:',
    '```',
    '{source}',
    '```',
    '',
    '- Does the surface commit to a small set of named roles (text,',
    '  surface, accent, success, danger, muted) or scatter raw hex / rgb',
    '  values?',
    '- Is the accent earning its presence (one primary CTA, one focal',
    '  highlight) or smeared across multiple competing elements?',
    '- Are neutrals doing structural work (cards, dividers, hover) without',
    '  drifting into tinted grays that read as accidental color?',
    '- Is contrast between text and surface sufficient for the role (body',
    '  ≥ 4.5:1; large display ≥ 3:1) or does the surface lean on chroma',
    '  to compensate for low luminance contrast?',
    '- Are semantic colors used consistently (danger only for destructive',
    '  outcomes, success only for confirmation) or decoratively?',
    '- Is dark mode a real rethink (recomputed roles, recovered contrast)',
    '  or a token swap that flattens hierarchy?',
    '',
    'Use the 3-axis output model (tier x impact x confidence). Be honest',
    'about confidence — code-only analysis sees declared tokens but not',
    'rendered hue, so confidence should drop when only raw values are',
    'visible without role context.',
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
    'Linear settings panel — a single accent (indigo) reserved for the',
    'active nav item and the primary save CTA, neutrals carry every',
    'structural border, success/danger appear only on confirmation toasts.',
    'Dark mode flips role tokens with recomputed contrast, not a luminance',
    'invert. The eye reads one accent and one structure layer.',
  ].join('\n'),
  negativeExample: [
    'Marketing dashboard with seven accent hues sprinkled across cards,',
    'badges, hover states, and section dividers. Raw `#3B82F6` and',
    '`rgb(34,197,94)` interleaved with token names. Every status pill',
    'gets a custom color, so semantic meaning is lost — green just means',
    '"chart entry," not "success."',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-C004',
    tier: 'foundational',
    impact: 'large',
    phase: 'critique',
  },
};
