// packages/cli/src/design-craft/catalog/exemplars/raycast-command-palette.ts
//
// Phase 2 catalog increment — third exemplar. Ported from the Phase 0 paper
// spike:
//   docs/changes/design-pipeline/design-craft-elevator/phase-0-schema-spike/
//   exemplars/raycast-command-palette.md
//
// Introduces a sixth componentType (`CommandPalette`) beyond the v1 seed list
// of EmptyState/LoadingState/ErrorState/Modal/Button. The `componentType`
// field is intentionally typed as `string` so the catalog can grow without a
// schema bump (see linear-empty-list.ts notes).
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.

import type { ExemplarDefinition } from './linear-empty-list.js';

export const raycastCommandPaletteExemplar: ExemplarDefinition = {
  id: 'exemplar-raycast-command-palette',
  name: 'Raycast Command Palette',
  componentType: 'CommandPalette',
  version: 1,
  status: 'stable',
  url: 'https://www.raycast.com',
  authoredAt: '2026-05-23',
  contributors: ['@chadjw'],
  source: {
    ref: 'raycast-app',
    url: 'https://www.raycast.com',
  },
  critique: [
    'Hierarchy: input field reads first (largest, top, focus ring); result',
    'list reads second with the active row highlighted; keyboard hints',
    'read last (smallest, dim, monospace). Three tiers, cleanly separated.',
    'Typography: result rows use sentence-case labels in reading weight;',
    'metadata (app source, action shortcut) uses tabular monospace at',
    'reduced weight + contrast. Numerals and shortcut keys align across',
    'rows.',
    'Visual: every row has a consistent left icon column, a label column,',
    'and a right metadata column. Vertical rhythm is locked. Active row',
    'gets a subtle saturated fill plus a 1px focus indicator, no shadow',
    'tricks.',
    'Density: 32px row height — dense enough for keyboard scanning, loose',
    'enough for mouse use. Inter-row padding is zero (rows abut), which',
    'sharpens the scan rhythm.',
    'Motion: result list updates with no entrance animation per row',
    '(would interfere with rapid keyboard scrolling); selection highlight',
    'moves with a 40ms transition just enough to confirm causality',
    'without slowing the keyboard user.',
  ].join('\n'),
  whyExemplar: [
    "Demonstrates that high-craft can be utility-first. Raycast's command",
    'palette is the canonical reference for keyboard-driven density done',
    'right: no chrome wasted, every pixel informational, motion',
    'subordinated to speed. The exemplar teaches restraint at the',
    "opposite end of the spectrum from Linear's empty state — proving",
    'that "stunning" is not synonymous with "minimal whitespace" but',
    'with "every choice intentional."',
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 95,
    hierarchy: 92,
    craftExecution: 95,
    function: 98,
    innovation: 88,
  },
  citationCount: 0,
};
