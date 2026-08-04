// packages/cli/src/design-craft/catalog/exemplars/sakazuki-marketing-page.ts
//
// MarketingPage tier — fourth whole-page exemplar. Claims the CRAFT-B012
// reservation (finding-codes.md, B009–B050 seed-growth band). Part of the
// award-documented marketing-page corpus (iv award-tier direction spec):
// page-level concept / composition / surface craft, not component polish.
//
// Provenance verified 2026-08-03: Awwwards Site of the Day, Jun 14 2026,
// with the Typography honor noted on the award page
// (https://www.awwwards.com/sites/sakazuki).
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.
// Honors ADR 0082 (page-level exemplar tier before section anchors).

import type { ExemplarDefinition } from './linear-empty-list.js';

export const sakazukiMarketingPageExemplar: ExemplarDefinition = {
  id: 'exemplar-sakazuki-marketing-page',
  name: 'sakazuki Marketing Page',
  componentType: 'MarketingPage',
  version: 1,
  status: 'stable',
  url: 'https://sakazuki.io/',
  authoredAt: '2026-08-03',
  contributors: ['@chadjw'],
  source: {
    ref: 'awwwards#sakazuki',
    url: 'https://www.awwwards.com/sites/sakazuki',
  },
  critique: [
    'Concept: the display face IS the imagery direction — a type-led',
    'food/drink page where the character of the letterforms carries the',
    'mood photography would otherwise supply. The concept (type as the',
    'vessel, matching the sake vessel the name refers to) is nameable in',
    'a sentence and every section pours into it.',
    'Composition: typesetting discipline is the compositional system —',
    'scale contrast between display moments and reading passages creates',
    'the rhythm; vertical rhythm and tracking are tuned per role rather',
    'than inherited. Sections vary between full-bleed type spectacle and',
    'quiet ledger-like passages instead of repeating one card shape.',
    'Surface: a restrained palette that lets type carry the mood — the',
    'background world is committed and calm, so the display face keeps',
    'total authority. Flatness here is a decision the concept calls for,',
    'not a default.',
    'Typography: the primary craft surface — display face chosen for',
    'character, set at confident scale with tight display tracking;',
    'body matter in a disciplined reading register; the scale contrast',
    'between the two is the page’s signature move.',
    'Motion + edges: motion is reserved for type moments (reveals timed',
    'to the scroll) rather than scattered; edge surfaces stay in the',
    'typographic register so the discipline never breaks.',
  ].join('\n'),
  whyExemplar: [
    'Teaches that when typography has enough character, the',
    '"no photography" constraint becomes the concept — this is the',
    'strongest reference for a type-led imagery ranking: type first,',
    'then motif, then treated photography. The Typography honor on the',
    'award page documents the judgment. Most competing pages treat type',
    'as a delivery mechanism and reach for photography to supply mood,',
    'ending with a stock display face over stock imagery — sakazuki',
    'proves the inverse ordering at award tier: one expressive face,',
    'disciplined typesetting, restrained palette, and the page needs',
    'nothing else.',
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 93,
    hierarchy: 92,
    craftExecution: 95,
    function: 87,
    innovation: 85,
  },
  citationCount: 0,
};
