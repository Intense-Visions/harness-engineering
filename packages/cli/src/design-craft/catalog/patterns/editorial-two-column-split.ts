// packages/cli/src/design-craft/catalog/patterns/editorial-two-column-split.ts
//
// Catalog increment — layout polish pattern, closing one of the documented
// P008-P015 gaps (a second `layout` sub-category pattern alongside P006
// progressive-corner-rounding).
//
// CRAFT-P008 — Editorial two-column split. polish × large. Sourced from the
// recurring "left-column monotony" finding a `density-rhythm` (C-tier)
// critique surfaces on text-heavy marketing/docs pages: a run of sections
// each rendered as one narrow `max-width` column pinned left (or centered),
// leaving ~50% empty on the opposite side. The rubric *detects* the
// monotony; this pattern *prescribes* the remedy — a heading rail + body
// column — so POLISH can suggest a concrete move, not just a diagnosis.
// Observed on real builds where every prose section hugged the left and the
// right half read "unfinished" rather than "spacious".
//
// Honors ADR 0020 (living catalog H pattern): id/version/status/authoredAt/
// contributors/source required so growth signal + provenance work.

import type { PatternDefinition } from './spring-physics.js';

/**
 * Pattern: Editorial Two-Column Split.
 *
 * Turns a stack of left-hugged narrow-column text sections into a paired
 * grid — eyebrow + heading in a left rail, body/content in the right
 * column — that fills the width and establishes reading rhythm. polish ×
 * large because it re-composes whole sections (not a finishing touch) yet
 * is not a foundational defect (the content still reads without it).
 */
export const editorialTwoColumnSplitPattern: PatternDefinition = {
  id: 'pattern-editorial-two-column-split',
  name: 'Editorial Two-Column Split',
  version: 1,
  status: 'stable',
  authoredAt: '2026-08-10',
  contributors: ['@chadjw'],
  source: {
    ref: 'refactoring-ui#layout-and-spacing + stripe/linear docs shell',
    url: 'https://www.refactoringui.com/',
  },
  applicableTo: [
    { kind: 'css-property', match: 'max-width' },
    { kind: 'css-property', match: 'margin-inline' },
    { kind: 'jsx-pattern', match: 'prose' },
  ],
  when: [
    'A run of text-heavy sections (intro, about, FAQ, scope, proposal',
    'body) are each rendered as a single narrow `max-width` column pinned',
    'to the left (or centered), leaving roughly half the section width',
    'empty. Repeated down the page the composition reads monotonous and',
    '"unfinished" — the empty side looks like a bug, not intentional',
    'whitespace — because nothing anchors it and every section is the',
    'same one-column shape.',
  ].join('\n'),
  suggest: [
    'Re-compose the section as a two-column grid: eyebrow + heading in a',
    'left rail, body/content in the right column. The rail may be',
    '`position: sticky` (top offset clearing any fixed header) so the',
    'heading holds while the body scrolls — an editorial/docs-shell move.',
    'Give the rail a smaller fractional width than the body (e.g.',
    '`minmax(220px, 0.8fr) 1.6fr`) so the content, not the label, leads.',
    'Collapse to a single column below a tablet breakpoint (and drop the',
    'sticky) so mobile stays a clean linear read. Reserve the plain',
    'single-column measure for genuinely long-form narrative (archetype',
    'C / editorial), not for every section by default.',
  ].join('\n'),
  before: [
    '<section class="section">',
    '  <div class="wrap measure">           /* max-width; margin-inline:auto */',
    '    <p class="eyebrow">The idea</p>',
    '    <h2>One ownable concept</h2>',
    '    <p>Lorem ipsum body copy that sits in a narrow left column…</p>',
    '  </div>                                /* right half sits empty */',
    '</section>',
  ].join('\n'),
  after: [
    '<section class="section">',
    '  <div class="wrap split">             /* grid: rail + body */',
    '    <div class="split__head">          /* optionally position:sticky */',
    '      <p class="eyebrow">The idea</p>',
    '      <h2 class="split__title">One ownable concept</h2>',
    '    </div>',
    '    <div class="split__body">',
    '      <p>Lorem ipsum body copy in the wider right column…</p>',
    '    </div>',
    '  </div>',
    '</section>',
    '',
    '/* .split { display:grid; grid-template-columns:minmax(220px,.8fr) 1.6fr;',
    '           gap: 2rem 4rem; align-items:start; }',
    '   .split__head { position: sticky; top: 96px; }',
    '   @media (max-width:820px){ .split{grid-template-columns:1fr}',
    '                             .split__head{position:static} }             */',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-P008',
    tier: 'polish',
    impact: 'large',
    phase: 'polish',
  },
};
