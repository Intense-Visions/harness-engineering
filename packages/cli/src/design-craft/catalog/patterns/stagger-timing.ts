// packages/cli/src/design-craft/catalog/patterns/stagger-timing.ts
//
// Phase 2 catalog increment — third polish pattern. Ported from the Phase 0
// paper spike:
//   docs/changes/design-pipeline/design-craft-elevator/phase-0-schema-spike/
//   patterns/stagger-timing.md
//
// CRAFT-P003. Exercises a third tier × impact combination (polish × small)
// to assert the catalog's tier-vs-impact independence and introduces a new
// `applicableTo.kind` (`jsx-pattern`) for higher-fidelity AST-shape matching
// once the POLISH phase grows beyond substring pre-filtering.
//
// Honors ADR 0020 (living catalog H pattern): id/version/status/authoredAt/
// contributors/source are required so growth signal + provenance work.

import type { PatternDefinition } from './spring-physics.js';

/**
 * Pattern: Stagger Timing.
 *
 * Spaces list-entrance animations 30-60ms apart so the eye reads ordering
 * and direction instead of "everything flashed at once." Small impact by
 * design — stagger is a craft elevator, not a foundational defect.
 */
export const staggerTimingPattern: PatternDefinition = {
  id: 'pattern-stagger-timing',
  name: 'Stagger Timing',
  version: 1,
  status: 'stable',
  authoredAt: '2026-05-23',
  contributors: ['@chadjw'],
  source: {
    ref: 'emil-design-eng#stagger',
    url: 'https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md',
  },
  applicableTo: [
    { kind: 'jsx-pattern', match: 'map' },
    { kind: 'css-selector', match: ':nth-child' },
    { kind: 'animation-property', match: 'animation-delay' },
  ],
  when: [
    'A list of items all animate in simultaneously. The result reads as',
    '"everything appeared at once" — the eye gets a single flash with no',
    'spatial or temporal information about ordering. This wastes an',
    'opportunity to convey hierarchy or directionality.',
  ].join('\n'),
  suggest: [
    'Stagger entrance animations by 30-60ms per item (faster for short',
    'lists, slower for ordered/hierarchical lists). For lists of >10',
    'items, cap stagger so total entrance duration stays under 600ms',
    '(otherwise the tail of the list feels late). For grid layouts,',
    'consider a 2D stagger (diagonal sweep from top-left).',
    'Reverse the stagger direction on exit so the most recently focused',
    'items leave last.',
    'Always respect `prefers-reduced-motion` (cross-fade all items',
    'simultaneously, no stagger).',
  ].join('\n'),
  before: [
    '{items.map(item => (',
    '  <motion.div',
    '    initial={{ opacity: 0, y: 8 }}',
    '    animate={{ opacity: 1, y: 0 }}',
    '    transition={{ duration: 0.2 }}',
    '  />',
    '))}',
  ].join('\n'),
  after: [
    '{items.map((item, i) => (',
    '  <motion.div',
    '    initial={{ opacity: 0, y: 8 }}',
    '    animate={{ opacity: 1, y: 0 }}',
    '    transition={{',
    '      delay: Math.min(i * 0.04, 0.6),',
    "      type: 'spring',",
    '      stiffness: 200,',
    '      damping: 25,',
    '    }}',
    '  />',
    '))}',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-P003',
    tier: 'polish',
    impact: 'small',
    phase: 'polish',
  },
};
