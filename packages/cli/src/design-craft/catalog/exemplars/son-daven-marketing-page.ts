// packages/cli/src/design-craft/catalog/exemplars/son-daven-marketing-page.ts
//
// MarketingPage tier — first whole-page exemplar. Claims the CRAFT-B009
// reservation (finding-codes.md, B009–B050 seed-growth band). Part of the
// award-documented marketing-page corpus (iv award-tier direction spec):
// page-level concept / composition / surface craft, not component polish.
//
// Provenance verified 2026-08-03: Awwwards Site of the Day, Jun 5 2026
// (https://www.awwwards.com/sites/son-daven).
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.
// Honors ADR 0082 (page-level exemplar tier before section anchors).

import type { ExemplarDefinition } from './linear-empty-list.js';

export const sonDavenMarketingPageExemplar: ExemplarDefinition = {
  id: 'exemplar-son-daven-marketing-page',
  name: 'Son Daven Marketing Page',
  componentType: 'MarketingPage',
  version: 1,
  status: 'stable',
  url: 'https://sondaven.com/en',
  authoredAt: '2026-08-03',
  contributors: ['@chadjw'],
  source: {
    ref: 'awwwards#son-daven',
    url: 'https://www.awwwards.com/sites/son-daven',
  },
  critique: [
    'Concept: one nameable idea — the estate itself is the narrator. The',
    'page argues the place (a Mallorcan finca and its land) rather than a',
    'list of amenities; the cultural narrative of the place IS the',
    'information architecture, so every section is a chapter of the story',
    'rather than a feature card. Each section can cite the concept: land,',
    'history, produce, stay — all read as one continuous account of place.',
    'Composition: chaptered scroll structure with per-section compositional',
    'shifts — full-bleed landscape moments alternate with intimate',
    'text-led passages; whitespace expands at chapter boundaries so the',
    'pacing reads like a told story, not a stacked template. The grid',
    'persists underneath while the narrative licenses the breaks.',
    'Surface: a committed place-derived two-color world — warm earthen',
    'ground plus one deep accent drawn from the landscape — held across',
    'every section instead of alternating neutral stripes. The palette is',
    'an argument about the place, not a default.',
    'Typography: expressive display face carrying the narrative voice;',
    'headings set large with tight tracking act as chapter titles, body',
    'text stays in a calm reading register so the display face keeps its',
    'authority. Type does the storytelling work photography would',
    'otherwise have to do.',
    'Motion + edges: scroll is the storytelling pacing device — reveals',
    'are timed to chapter entries rather than sprinkled per-element, and',
    'the page closes on a designed footer that lands the story instead of',
    'dumping a link list.',
  ].join('\n'),
  whyExemplar: [
    'Teaches that a committed two-color world plus a concept derived from',
    'place beats any amount of component polish: the direction (place as',
    'narrator) is strong enough to reject a nonconforming section on',
    'sight. Sections cite the narrative, not a feature list. Most',
    'competing marketing pages assemble hero + cards + testimonial + CTA',
    'in a borrowed palette, so swapping the brand out changes nothing;',
    "Son Daven's page cannot be re-skinned for another estate without",
    'rewriting it, and that irreplaceability is the lesson the',
    'MarketingPage tier exists to score.',
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 96,
    hierarchy: 88,
    craftExecution: 93,
    function: 85,
    innovation: 92,
  },
  citationCount: 0,
};
