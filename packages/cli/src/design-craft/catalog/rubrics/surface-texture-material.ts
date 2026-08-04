// packages/cli/src/design-craft/catalog/rubrics/surface-texture-material.ts
//
// CRAFT-C013 — third page-scoped rubric of the marketing-page tier
// (finding-codes.md, C011–C020 growth band; ADR 0082). Judges background
// as a decision, texture/material stance, and whether the material system
// reaches the page's edge surfaces — completing the concept/composition/
// surface trio with C011 and C012.

import type { RubricDefinition } from './hierarchy-clarity.js';

export const surfaceTextureMaterialRubric: RubricDefinition = {
  id: 'rubric-surface-texture-material',
  name: 'Surface, Texture & Material',
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
    'Evaluate the surface, texture, and material treatment of {target}.',
    '',
    'Source under review:',
    '```',
    '{source}',
    '```',
    '',
    '- Is the background a DECISION — a committed non-white/non-default',
    '  world the palette argues for — or the unexamined default?',
    '- Is there a texture/material treatment (grain, noise, paper, metal,',
    '  print artifacts) or a DELIBERATE flatness the concept calls for?',
    '  Absent-by-default and absent-by-decision read differently.',
    '- Do backgrounds differ per section in a way that structures the page',
    '  (acts, chapters, mood shifts) or only as alternating stripe filler?',
    '- Are material effects built with owned CSS (blend modes, masks,',
    '  data-URI grain, gradients within budget) rather than heavy raster',
    '  assets that break the performance covenant?',
    '- Do edge surfaces carry the material too — ::selection, hover states,',
    '  footer — or does the material stop at the hero?',
    '',
    'Use the 3-axis output model (tier x impact x confidence). Declared',
    'texture tokens, blend modes, and background values are visible from',
    'code; the rendered material quality is not — drop confidence in',
    'fast/code-only mode and reserve high confidence for deep mode.',
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
    'A near-monochrome page on a warm off-black world with a data-URI',
    'grain at 4% opacity, one metallic accent reserved for credentials,',
    'and a ::selection color in the accent — the material system reaches',
    'the footer.',
  ].join('\n'),
  negativeExample: [
    'Pure-white background throughout, no texture stance, alternating',
    '#f9fafb bands as the only surface variation, default blue selection',
    'color.',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-C013',
    tier: 'polish',
    impact: 'medium',
    phase: 'critique',
  },
};
