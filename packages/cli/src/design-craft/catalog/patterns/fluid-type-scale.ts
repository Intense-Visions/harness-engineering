// packages/cli/src/design-craft/catalog/patterns/fluid-type-scale.ts
//
// Phase 2 catalog increment — fifth polish pattern. Opens the typography
// sub-category of the v1 polish seed (3 typography patterns planned per
// success criterion #8; this commit ships the anchor, P008 + P010 land in
// subsequent slices).
//
// CRAFT-P005. Exercises a fifth tier × impact combination
// (polish × large) for the typography category — fluid type elevates
// every page that has typographic hierarchy, so impact reads as large
// even though the tier is `polish` (a project with a fixed type scale is
// not broken, just unrefined).
//
// Honors ADR 0020 (living catalog H pattern): id/version/status/authoredAt/
// contributors/source are required so growth signal + provenance work.

import type { PatternDefinition } from './spring-physics.js';

/**
 * Pattern: Fluid Type Scale.
 *
 * Replaces fixed breakpoint-stepped font sizes with a fluid clamp() scale
 * that interpolates between a minimum and maximum across the viewport
 * range. Headlines stop looking small on desktop and oversized on phone;
 * body type stays comfortably readable at every width without an explicit
 * breakpoint per step.
 *
 * The high-craft move is to use a calculated `vi` (or `vw`) coefficient
 * (not a guessed one) — pair the min/max with the viewport range that
 * actually contains your audience.
 */
export const fluidTypeScalePattern: PatternDefinition = {
  id: 'pattern-fluid-type-scale',
  name: 'Fluid Type Scale',
  version: 1,
  status: 'stable',
  authoredAt: '2026-05-31',
  contributors: ['@chadjw'],
  source: {
    ref: 'vercel-geist#typography',
    url: 'https://vercel.com/geist/typography',
  },
  applicableTo: [
    { kind: 'css-property', match: 'font-size' },
    { kind: 'tailwind-class', match: 'text-' },
    { kind: 'identifier', match: 'fontSize' },
    { kind: 'css-at-rule', match: 'media' },
  ],
  when: [
    'Typographic scale is defined as a fixed sequence of font-size values',
    '(e.g., 14 / 16 / 18 / 24 / 32) and breakpoint-stepped via media',
    'queries or Tailwind responsive variants (text-sm md:text-base',
    'lg:text-lg). Between breakpoints the type "jumps" — a 1280px viewport',
    'gets the desktop size, a 1279px viewport gets the tablet size, with',
    'no interpolation. Headlines feel undersized on wide screens and',
    'oversized on narrow ones.',
  ].join('\n'),
  suggest: [
    'Replace stepped sizes with a fluid clamp() scale that interpolates',
    'between min and max across a calibrated viewport range. Formula:',
    '  font-size: clamp(<min>, <preferred>, <max>);',
    'where `<preferred>` is a linear combination of `vi` (viewport',
    'inline) and `rem` calibrated to hit `<min>` at your narrow',
    'audience viewport (e.g., 360px) and `<max>` at your wide audience',
    'viewport (e.g., 1280px).',
    'Use a utility (e.g., utopia.fyi, the Geist `fluid()` helper, or a',
    'CSS variable per scale step) so the formula is calculated, not',
    'guessed. Pair with `text-wrap: balance` on headings and',
    '`text-wrap: pretty` on body for the matching wrap-quality move.',
    'Always honor `prefers-reduced-motion` for any width-driven motion',
    '(this pattern is static — no motion concerns — but pair correctly',
    'with width-animated layouts).',
  ].join('\n'),
  before: [
    '/* CSS — fixed scale, breakpoint-stepped */',
    '.title {',
    '  font-size: 1.5rem;',
    '}',
    '@media (min-width: 768px) {',
    '  .title { font-size: 2rem; }',
    '}',
    '@media (min-width: 1280px) {',
    '  .title { font-size: 2.5rem; }',
    '}',
  ].join('\n'),
  after: [
    '/* CSS — fluid scale calibrated for 360px–1280px audience */',
    '.title {',
    '  /* clamp(min, preferred, max) — preferred interpolates linearly */',
    '  font-size: clamp(1.5rem, 0.93rem + 1.79vi, 2.5rem);',
    '  text-wrap: balance;',
    '}',
    '',
    '/* Tailwind v4 equivalent using arbitrary value */',
    '// <h1 className="text-[clamp(1.5rem,0.93rem+1.79vi,2.5rem)] text-balance">',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-P005',
    tier: 'polish',
    impact: 'large',
    phase: 'polish',
  },
};
