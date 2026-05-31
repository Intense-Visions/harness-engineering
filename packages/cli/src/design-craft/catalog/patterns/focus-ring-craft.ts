// packages/cli/src/design-craft/catalog/patterns/focus-ring-craft.ts
//
// Phase 2 catalog increment — seventh polish pattern. Opens the
// interaction sub-category of the 15-pattern v1 seed (3 motion + 3
// skeleton + 3 typography + 3 interaction + 3 layout per success
// criterion #8).
//
// CRAFT-P007. First foundational-tier pattern that ties craft to
// accessibility — a missing or anaemic focus ring is both an a11y defect
// (WCAG 2.4.7) and a craft tell (keyboard users see a generic browser
// ring or nothing at all). The crafted version uses the brand's accent
// token, an offset, and a halo so the focus state reads as part of the
// design system rather than an OS leftover.
//
// Honors ADR 0020 (living catalog H pattern): id/version/status/authoredAt/
// contributors/source are required so growth signal + provenance work.

import type { PatternDefinition } from './spring-physics.js';

/**
 * Pattern: Focus Ring Craft.
 *
 * tier=`foundational`, impact=`large`. Keyboard focus visibility is
 * non-negotiable (WCAG 2.4.7 Level AA) so a missing or invisible ring is
 * a foundational defect, not a polish nicety. The pattern still lives in
 * the CRAFT-P namespace because the elevation move — accent token +
 * offset + halo — is judgment-bound, not enforceable by `:focus-visible
 * { outline: 0 }` greps alone.
 *
 * Composes with CRAFT-C009 (interaction craft rubric); the rubric flags
 * "interaction feels OS-default" symptomatically, this pattern names the
 * concrete elevation.
 */
export const focusRingCraftPattern: PatternDefinition = {
  id: 'pattern-focus-ring-craft',
  name: 'Focus Ring Craft',
  version: 1,
  status: 'stable',
  authoredAt: '2026-05-31',
  contributors: ['@chadjw'],
  source: {
    ref: 'emil-design-eng#focus-ring',
    url: 'https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md',
  },
  applicableTo: [
    { kind: 'css-property', match: 'outline' },
    { kind: 'css-property', match: 'box-shadow' },
    { kind: 'css-pseudo-class', match: ':focus' },
    { kind: 'css-pseudo-class', match: ':focus-visible' },
    { kind: 'jsx-attribute', match: 'focusVisibleRing' },
  ],
  when: [
    'Focus styling is missing (`outline: none` without a replacement),',
    'relies on the browser default (1-2px solid ring that ignores brand',
    'tokens), or uses the same accent as the resting state (no visible',
    'transition on focus). Keyboard users either see nothing or see a',
    'ring that reads as a leftover from the OS, not part of the product.',
  ].join('\n'),
  suggest: [
    'Build the ring from three layers:',
    '  1. A 2-3px solid stroke in the brand accent token',
    '     (`--color-accent-focus`), NOT the default browser blue.',
    '  2. An offset of 2-3px (`outline-offset` or a second box-shadow',
    '     layer) so the ring floats off the element instead of cropping',
    '     its corners.',
    '  3. A soft halo (8-12px box-shadow at 20-30% opacity of the accent)',
    '     so the ring reads on busy or low-contrast backgrounds.',
    'Always pair with `:focus-visible` (not bare `:focus`) so pointer',
    'users do not see the ring on click. Respect `prefers-reduced-motion`',
    'by skipping the spring/scale on focus-in and crossfading the ring',
    'opacity instead.',
    'Never ship `outline: 0` (or `outline: none`) without a replacement —',
    'the bare reset is the single most common craft + a11y regression.',
  ].join('\n'),
  before: [
    'button:focus {',
    '  outline: none;',
    '}',
    '',
    '/* or, worse: */',
    'button:focus { outline: 1px solid Highlight; }',
  ].join('\n'),
  after: [
    'button:focus-visible {',
    '  outline: 2px solid var(--color-accent-focus);',
    '  outline-offset: 2px;',
    '  box-shadow: 0 0 0 6px rgb(from var(--color-accent-focus) r g b / 0.24);',
    '  transition: box-shadow 120ms ease-out;',
    '}',
    '',
    '@media (prefers-reduced-motion: reduce) {',
    '  button:focus-visible { transition: none; }',
    '}',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-P007',
    tier: 'foundational',
    impact: 'large',
    phase: 'polish',
  },
};
