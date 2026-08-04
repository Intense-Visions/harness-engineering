// packages/cli/src/design-craft/catalog/exemplars/kvell-marketing-page.ts
//
// MarketingPage tier — seventh whole-page exemplar. Claims the CRAFT-B015
// reservation (finding-codes.md, B009–B050 seed-growth band). Part of the
// award-documented marketing-page corpus (iv award-tier direction spec):
// page-level concept / composition / surface craft, not component polish.
//
// Provenance verified 2026-08-03: Awwwards Site of the Day, Apr 19 2017,
// credited to Locomotive (https://www.awwwards.com/sites/kvell). The
// planned provenance (Locomotive's own case study at
// locomotive.ca/en/work/kvell) is no longer on Locomotive's live site
// (404 verified; a 2023 snapshot exists in the Internet Archive), so the
// canonical award page is cited instead per the catalog's
// verify-never-invent rule.
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.
// Honors ADR 0082 (page-level exemplar tier before section anchors).

import type { ExemplarDefinition } from './linear-empty-list.js';

export const kvellMarketingPageExemplar: ExemplarDefinition = {
  id: 'exemplar-kvell-marketing-page',
  name: 'Kvell Marketing Page',
  componentType: 'MarketingPage',
  version: 1,
  status: 'stable',
  url: 'https://kvell.co',
  authoredAt: '2026-08-03',
  contributors: ['@chadjw'],
  source: {
    ref: 'awwwards#kvell',
    url: 'https://www.awwwards.com/sites/kvell',
  },
  critique: [
    'Concept: a concept-driven commissioned-content system — a playful',
    'furniture brand ("contemporary and functional design attainable to',
    'everyone", per the award page) where color law, type character, and',
    'object photography style were designed as ONE argument. The concept',
    'sentence came first; every craft lever is derived from it.',
    'Composition: product display as choreography — horizontal catalog',
    'navigation and lookbook moments (both documented as collected',
    'elements on the award page) give each section its own compositional',
    'device while staying inside one playful system; no section repeats',
    'a default card grid.',
    'Surface: a committed bright color world matched to the commissioned',
    'object photography — backgrounds are chosen per section to hold the',
    'products, so surface and content read as designed together rather',
    'than photography dropped onto a template.',
    'Typography: rounded, friendly type character matching the furniture',
    'forms — the display face argues the same playfulness as the palette',
    'and the photography, one voice across all three.',
    'Motion + edges: choreographed scroll pacing as brand personality —',
    'the dot-navigation catalog scroll is the signature move, used as',
    'the one place the spectacle budget goes rather than motion',
    'sprinkled everywhere.',
  ].join('\n'),
  whyExemplar: [
    'Teaches the direction-dossier workflow itself: the concept sentence',
    'comes FIRST and every craft lever — palette, type, motion tone,',
    'photography style — is derived from it, which is the trace this',
    'whole tier exists to teach. The commissioned-content lesson also',
    'sets the boundary honestly: when imagery is part of the argument it',
    'is designed as a system, not sourced from stock. Most competing',
    'product pages pick a template first and pour brand assets into it,',
    'so palette, type, and photography argue three different things;',
    "Kvell's single-argument system is the counterexample, documented at",
    'award tier.',
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 93,
    hierarchy: 91,
    craftExecution: 94,
    function: 89,
    innovation: 86,
  },
  citationCount: 0,
};
