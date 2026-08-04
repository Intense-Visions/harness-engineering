// packages/cli/src/design-craft/catalog/exemplars/baillat-studio-marketing-page.ts
//
// MarketingPage tier — eighth whole-page exemplar. Claims the CRAFT-B016
// reservation (finding-codes.md, B009–B050 seed-growth band). Part of the
// award-documented marketing-page corpus (iv award-tier direction spec):
// page-level concept / composition / surface craft, not component polish.
//
// Provenance verified 2026-08-03: Locomotive published case study —
// https://locomotive.ca/en/work/baillat-studio ("Baillat Studio |
// Locomotive") — live alongside the studio's own site
// (baillatstudio.com).
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.
// Honors ADR 0082 (page-level exemplar tier before section anchors).

import type { ExemplarDefinition } from './linear-empty-list.js';

export const baillatStudioMarketingPageExemplar: ExemplarDefinition = {
  id: 'exemplar-baillat-studio-marketing-page',
  name: 'Baillat Studio Marketing Page',
  componentType: 'MarketingPage',
  version: 1,
  status: 'stable',
  url: 'https://baillatstudio.com',
  authoredAt: '2026-08-03',
  contributors: ['@chadjw'],
  source: {
    ref: 'locomotive#baillat-studio',
    url: 'https://locomotive.ca/en/work/baillat-studio',
  },
  critique: [
    'Concept: restraint as the committed direction — a typography-led',
    'studio identity where display type is the SOLE spectacle. The',
    'concept (the work speaks; the site is a typographic frame) is',
    'nameable in a sentence and disciplines every other decision toward',
    'near-absence.',
    'Composition: extreme whitespace confidence — near-absent imagery',
    'means the composition is carried by type scale contrast and the',
    'placement of very few elements; every section holds the same',
    'reductive standard, so nothing decays after the first viewport',
    'because there is nothing unconsidered anywhere.',
    'Surface: the "deliberate flatness" branch of surface craft done at',
    'reference level — no texture, no gradients, no material effects,',
    'and the absence reads as a decision because the concept names it.',
    'Absent-by-decision, not absent-by-default.',
    'Typography: display type as the only imagery — one face with enough',
    'character to carry the entire page, set at extreme scale contrast',
    'against small functional matter. The typesetting IS the art',
    'direction.',
    'Motion + edges: a motion vocabulary reduced to a few named moves',
    'used consistently — one signature motion register rather than',
    'per-element effects; edge surfaces stay inside the reductive',
    'discipline so the restraint never breaks.',
  ].join('\n'),
  whyExemplar: [
    'The counterweight exemplar: it stops the corpus from reading as',
    '"texture is mandatory." Teaches restraint as a committed direction',
    '— one signature motion register plus type scale contrast can carry',
    'an entire page, provided the flatness is argued by the concept',
    'rather than left over from a template. Most competing minimal',
    'pages are minimal by omission (default background, system type,',
    "no stance) and read as unfinished; Baillat's minimalism is",
    'authored, and the difference between absent-by-default and',
    'absent-by-decision is precisely what the surface rubric asks',
    'critics to distinguish.',
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 96,
    hierarchy: 87,
    craftExecution: 94,
    function: 84,
    innovation: 91,
  },
  citationCount: 0,
};
