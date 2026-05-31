// packages/cli/src/design-craft/catalog/patterns/progressive-corner-rounding.ts
//
// Phase 2 catalog increment — sixth polish pattern. Opens the layout
// sub-category of the 15-pattern v1 seed (3 motion + 3 skeleton + 3
// typography + 3 interaction + 3 layout per success criterion #8).
//
// CRAFT-P006. Exercises a new `applicableTo.kind` value (`css-variable`)
// alongside the existing JSX-attribute / CSS-property kinds, demonstrating
// that the schema's open-ended `kind` field (Phase 0 review O7) continues
// to accept new discriminators as new sub-categories arrive.
//
// Honors ADR 0020 (living catalog H pattern): id/version/status/authoredAt/
// contributors/source are required so growth signal + provenance work.

import type { PatternDefinition } from './spring-physics.js';

/**
 * Pattern: Progressive Corner Rounding.
 *
 * When a child element nests inside a rounded parent, the child's corner
 * radius should be smaller than the parent's by the gap between them
 * (`childRadius = parentRadius - gap`). Uniform radii across the nesting
 * chain produce a visible halo where the inner corner doesn't track the
 * outer one — small in isolation, but every high-craft UI gets this
 * relationship right.
 *
 * tier=`polish`, impact=`small`. Easy to ship, easy to dismiss; the value
 * is cumulative across every nested surface in the product. The LLM may
 * upgrade impact when the nesting violates the relationship across many
 * surfaces (a settings panel with five nested rounded cards, for instance).
 */
export const progressiveCornerRoundingPattern: PatternDefinition = {
  id: 'pattern-progressive-corner-rounding',
  name: 'Progressive Corner Rounding',
  version: 1,
  status: 'stable',
  authoredAt: '2026-05-31',
  contributors: ['@chadjw'],
  source: {
    ref: 'emil-design-eng#progressive-rounding',
    url: 'https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md',
  },
  applicableTo: [
    { kind: 'css-property', match: 'border-radius' },
    { kind: 'jsx-attribute', match: 'borderRadius' },
    { kind: 'css-variable', match: '--radius' },
  ],
  when: [
    'A rounded child sits inside a rounded parent with the same (or larger)',
    'corner radius as the parent. The eye reads a visible halo between the',
    'two corner arcs because they fail to share a common centre. Common',
    'failure mode: a `rounded-xl` card containing a `rounded-xl` inner',
    'panel; the inner corner protrudes past the outer one.',
  ].join('\n'),
  suggest: [
    'Compute the child radius as `parentRadius - gap`, where `gap` is the',
    'padding between the parent edge and the child edge. The resulting',
    'corners are concentric — the inner curve tracks the outer curve and',
    'the eye reads one nested shape, not two unrelated rounded rectangles.',
    'When the gap exceeds the parent radius the child should be square',
    '(`borderRadius: 0`); a positive radius below the gap is worse than',
    'no rounding because it telegraphs the mismatch.',
    'Pair with a single radius scale (`--radius-sm`, `--radius-md`,',
    '`--radius-lg`) so the chain stays consistent as the design system',
    'grows.',
  ].join('\n'),
  before: [
    '<div className="p-3 rounded-xl bg-surface-1">',
    '  <div className="p-3 rounded-xl bg-surface-2">',
    '    {/* inner corner protrudes past the outer corner */}',
    '  </div>',
    '</div>',
  ].join('\n'),
  after: [
    '// Outer radius 12px, padding 12px → inner radius 0',
    '// (gap equals parent radius — square the child).',
    '<div className="p-3 rounded-xl bg-surface-1">',
    '  <div className="p-3 rounded-none bg-surface-2">',
    '    {/* corners are concentric (or square when gap >= radius) */}',
    '  </div>',
    '</div>',
    '',
    '// Or, when padding is smaller than the parent radius:',
    '// outer 12px, padding 4px → inner 8px.',
    '<div style={{ padding: 4, borderRadius: 12 }}>',
    '  <div style={{ borderRadius: 8 }} />',
    '</div>',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-P006',
    tier: 'polish',
    impact: 'small',
    phase: 'polish',
  },
};
