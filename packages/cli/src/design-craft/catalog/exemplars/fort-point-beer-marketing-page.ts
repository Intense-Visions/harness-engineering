// packages/cli/src/design-craft/catalog/exemplars/fort-point-beer-marketing-page.ts
//
// MarketingPage tier — sixth whole-page exemplar. Claims the CRAFT-B014
// reservation (finding-codes.md, B009–B050 seed-growth band). Part of the
// award-documented marketing-page corpus (iv award-tier direction spec):
// page-level concept / composition / surface craft, not component polish.
//
// Provenance verified 2026-08-03: Manual (studio) published case study —
// https://manualcreative.com/work/fort-point ("Fort Point Beer Co. |
// Manual") — the rare exemplar whose design rationale is public rather
// than inferred.
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.
// Honors ADR 0082 (page-level exemplar tier before section anchors).

import type { ExemplarDefinition } from './linear-empty-list.js';

export const fortPointBeerMarketingPageExemplar: ExemplarDefinition = {
  id: 'exemplar-fort-point-beer-marketing-page',
  name: 'Fort Point Beer Co. Marketing Page',
  componentType: 'MarketingPage',
  version: 1,
  status: 'stable',
  url: 'https://fortpointbeer.com',
  authoredAt: '2026-08-03',
  contributors: ['@chadjw'],
  source: {
    ref: 'manual-creative#fort-point',
    url: 'https://manualcreative.com/work/fort-point',
  },
  critique: [
    'Concept: place-derived modular motif — the Golden Gate Bridge’s',
    'geometry (the brewery sits at its foot) abstracted into a repeatable',
    'mark system. The concept is nameable in one sentence and gives every',
    'section a citation back to the place; the case study documents the',
    'derivation, so the reasoning is public rather than inferred.',
    'Composition: the identity system does compositional work — the',
    'modular motif scales from favicon to full-bleed band, structuring',
    'sections as variations on one geometric language instead of a',
    'repeated card grid. Packaging, bands, and page sections all read as',
    'instances of the same system.',
    'Surface: a committed palette drawn from the identity system, applied',
    'as flat confident planes — the geometric material carries the page',
    'without texture effects; surfaces are owned because every color and',
    'band cites the mark system.',
    'Typography: workmanlike modernist type that lets the motif system',
    'lead — type roles are disciplined so the geometry stays the',
    'protagonist; wordmark and headings share the system’s constructed',
    'character.',
    'Motion + edges: restraint throughout — the system’s strength is',
    'that it needs no spectacle; edge surfaces (packaging shots, footer,',
    'small marks) all carry the motif, so the argument reaches every',
    'corner of the page.',
  ].join('\n'),
  whyExemplar: [
    'Teaches that a motif system derived from place gives every section',
    'a citation back to the concept — this is the dossier-earned "custom',
    'motif" lever done right: derived (from the Golden Gate), modular',
    '(scales favicon to full-bleed), and documented (Manual’s published',
    'case study traces the rationale). Most competing brand pages bolt a',
    'logo onto a template and hope the palette carries the identity;',
    'Fort Point shows the inverse — the identity system IS the page',
    'architecture. For the catalog it is also the reference for',
    'provenance quality: a published case study beats an inferred',
    'critique.',
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 95,
    hierarchy: 89,
    craftExecution: 93,
    function: 90,
    innovation: 84,
  },
  citationCount: 0,
};
