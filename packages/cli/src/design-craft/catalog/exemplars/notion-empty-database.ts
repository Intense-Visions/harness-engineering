// packages/cli/src/design-craft/catalog/exemplars/notion-empty-database.ts
//
// Phase 2 catalog increment — seventh exemplar. Closes the CRAFT-B007
// reservation called out in finding-codes.md (second EmptyState anchor)
// and opens the horizontal-growth phase of the seed: every canonical
// componentType is already anchored, and the catalog now grows by adding
// distinct exemplars per type (per the spec's "10 exemplars per type" plan)
// rather than by introducing new types.
//
// Notion's empty database / blank page state is the anchor because it
// is the canonical reference for an INSTRUCTIONAL EmptyState — a register
// distinct from Linear's calm "inbox zero" pattern (CRAFT-B001). Where
// Linear's empty state is resolved + restraint-led ("you're done, nothing
// to do"), Notion's is instructive + agency-led ("here is the one command
// that unlocks the surface"). Both are valid v1 patterns; carrying both
// gives BENCHMARK enough reference variance per componentType to score
// targets against the right register rather than collapsing every
// EmptyState toward a single tonal model.
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.

import type { ExemplarDefinition } from './linear-empty-list.js';

export const notionEmptyDatabaseExemplar: ExemplarDefinition = {
  id: 'exemplar-notion-empty-database',
  name: 'Notion Empty Database / Blank Page',
  componentType: 'EmptyState',
  version: 1,
  status: 'stable',
  url: 'https://www.notion.so/help/guides/database-views',
  authoredAt: '2026-05-31',
  contributors: ['@chadjw'],
  source: {
    ref: 'notion-app#empty-database',
    url: 'https://www.notion.so/help/category/databases',
  },
  critique: [
    'Hierarchy: the single inline prompt ("Press / for commands") is the',
    'focal element of the surface, set in reading weight at body size on',
    'the page itself, not in a separate centered card. The cursor blinks',
    'where the next action will land, so the eye anchors on the action',
    'site rather than on decorative chrome. Slash-menu hints, drag-handle',
    'affordances, and the empty-row gridlines read as quieter peripheral',
    'cues — they support the prompt without competing with it.',
    "Typography: prompt set in Notion's content typeface (the same the",
    'body uses), reinforcing that the empty surface is the writing',
    'surface, not a separate state. Slash glyph (/) is rendered at the',
    'same weight as the surrounding label — no special chrome.',
    'Visual: the surface IS the empty state — no centered illustration,',
    'no card boundary, no painted background. The blank page is the',
    'canvas the user will draw on; surfacing chrome around it would',
    'imply that emptiness is a state requiring chrome. The only visible',
    'micro-affordance is a faint plus icon in the side rail and the',
    'slash hint inline.',
    'Density: comfortable margins identical to the loaded state — when',
    'the user types their first character, no layout shift occurs, no',
    'chrome dissolves. The empty state is geometrically a subset of',
    'the loaded state.',
    'Motion: the cursor blink IS the motion. No looping illustration,',
    'no shimmer, no entrance animation. Pressing slash opens the command',
    'palette with a tuned spring slide-down (~180ms) so the inline',
    'transition feels like a continuation of typing, not a modal jump.',
    'Interaction: every empty surface is keyboard-first — slash opens',
    'the command palette, arrow keys navigate the database views',
    'sidebar, escape returns focus to the page body. The empty state',
    'demands no pointer interaction to escape; the keyboard-first user',
    'never has to reach for the mouse to leave emptiness behind.',
    'Copy: the prompt names the input action ("Press / for commands"),',
    'not the result ("Add content"). The phrasing teaches the system',
    'gesture rather than instructing on intent — the user supplies',
    'the intent. Calm, specific, non-marketing voice consistent with',
    "Notion's product surface elsewhere.",
  ].join('\n'),
  whyExemplar: [
    'Demonstrates the INSTRUCTIONAL EmptyState register most product',
    'empty states miss. Linear (CRAFT-B001) shows the resolved register',
    "(you're done — nothing to do). Notion shows the agency register",
    '(here is the one gesture that unlocks the surface). Most competing',
    'empty states collapse both registers into the same generic pattern',
    '(centered illustration + heading + body + CTA), which is the wrong',
    'shape for "you have a brand-new database, what do you want to put',
    'in it." The proof points are: (1) the surface IS the empty state —',
    'no extra chrome painted around it; (2) the prompt teaches the',
    'system gesture (slash) rather than describing the result; (3) the',
    'empty state is geometrically a subset of the loaded state, so',
    'first-keystroke transitions are layout-stable; (4) every escape',
    'route from empty is keyboard-first. Carrying both Linear and Notion',
    'as EmptyState anchors lets BENCHMARK distinguish "this surface',
    'wants the resolved register" from "this surface wants the agency',
    'register" rather than scoring every empty state against a single',
    'tonal model. The exemplar composes naturally with `CRAFT-C001`',
    '(hierarchy — the inline prompt as single focal element), `CRAFT-C006`',
    '(restraint — no chrome around emptiness), `CRAFT-C008` (copy voice',
    '— action-naming over intent-naming), and `CRAFT-C009` (interaction',
    'craft — keyboard-first escape from empty).',
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 95,
    hierarchy: 90,
    craftExecution: 91,
    function: 93,
    innovation: 86,
  },
  citationCount: 0,
};
