// packages/cli/src/design-craft/catalog/exemplars/la-revoltosa-marketing-page.ts
//
// MarketingPage tier — second whole-page exemplar. Claims the CRAFT-B010
// reservation (finding-codes.md, B009–B050 seed-growth band). Part of the
// award-documented marketing-page corpus (iv award-tier direction spec):
// page-level concept / composition / surface craft, not component polish.
//
// Provenance verified 2026-08-03: Awwwards Site of the Day, May 21 2026
// (https://www.awwwards.com/sites/la-revoltosa).
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.
// Honors ADR 0082 (page-level exemplar tier before section anchors).

import type { ExemplarDefinition } from './linear-empty-list.js';

export const laRevoltosaMarketingPageExemplar: ExemplarDefinition = {
  id: 'exemplar-la-revoltosa-marketing-page',
  name: 'La Revoltosa Marketing Page',
  componentType: 'MarketingPage',
  version: 1,
  status: 'stable',
  url: 'https://larevoltosa.es/',
  authoredAt: '2026-08-03',
  contributors: ['@chadjw'],
  source: {
    ref: 'awwwards#la-revoltosa',
    url: 'https://www.awwwards.com/sites/la-revoltosa',
  },
  critique: [
    'Concept: the rebellious register of the brand name is the thesis —',
    'voice, illustration, and palette all argue the same insurgent energy,',
    'so the page reads as one attitude rather than a menu of sections.',
    'Every section cites the rebellion: product, story, and CTA share the',
    'same defiant tone instead of code-switching into corporate calm.',
    'Composition: illustration-driven scroll storytelling — drawn scenes',
    'carry the narrative down the page, with sections breaking the grid',
    'where the illustrations demand it. The kinetic feel comes from',
    'composition and choreographed reveals, not from JS-dependence — the',
    'lesson boundary is energy achieved within an affordable motion',
    'budget.',
    'Surface: a HARD two-color commitment — the accent is used under a',
    'strict law and forbidden everywhere else, which is what makes its',
    'appearances land. Backgrounds hold the committed world across the',
    'whole scroll rather than defaulting to white between illustrated',
    'moments.',
    'Typography: display type in the same rebellious voice as the copy —',
    'loud where the message is loud, never wandering into a neutral',
    'corporate register that would break the argument. Type and',
    'illustration share one drawn character.',
    'Motion + edges: reveals are choreographed to the story beats of the',
    'scroll; hover states and small interactions carry the same drawn',
    'energy so the attitude does not stop at the hero.',
  ].join('\n'),
  whyExemplar: [
    'Teaches color commitment as a LAW, not a palette: the accent has a',
    'usage rule and a forbidden list, and the page is disciplined enough',
    'that a stranger could reject a nonconforming section for breaking',
    'it. Also teaches illustration as SYSTEM, not decoration — the drawn',
    'language is the imagery direction, doing the work stock photography',
    'cannot. Most competing pages either scatter their accent across',
    'every button and icon until it means nothing, or drop in one-off',
    "illustrations that belong to no system; La Revoltosa's restraint-",
    'plus-attitude combination is the lesson.',
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 95,
    hierarchy: 90,
    craftExecution: 92,
    function: 86,
    innovation: 90,
  },
  citationCount: 0,
};
