// packages/cli/src/design-craft/catalog/exemplars/hagis-barbershop-marketing-page.ts
//
// MarketingPage tier — fifth whole-page exemplar. Claims the CRAFT-B013
// reservation (finding-codes.md, B009–B050 seed-growth band). Part of the
// award-documented marketing-page corpus (iv award-tier direction spec):
// page-level concept / composition / surface craft, not component polish.
//
// Provenance verified 2026-08-03: Awwwards Site of the Day, Aug 18 2021.
// NOTE the canonical Awwwards slug is `hagisbarbershop` (no hyphens) —
// https://www.awwwards.com/sites/hagisbarbershop — verified live along
// with the site itself (hagisbarbershop.de).
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.
// Honors ADR 0082 (page-level exemplar tier before section anchors).

import type { ExemplarDefinition } from './linear-empty-list.js';

export const hagisBarbershopMarketingPageExemplar: ExemplarDefinition = {
  id: 'exemplar-hagis-barbershop-marketing-page',
  name: 'Hagis Barbershop Marketing Page',
  componentType: 'MarketingPage',
  version: 1,
  status: 'stable',
  url: 'https://hagisbarbershop.de/',
  authoredAt: '2026-08-03',
  contributors: ['@chadjw'],
  source: {
    ref: 'awwwards#hagisbarbershop',
    url: 'https://www.awwwards.com/sites/hagisbarbershop',
  },
  critique: [
    'Concept: the trade IS the art direction — a barbershop page whose',
    'visual system is the craft itself (tools, gestures, the ritual of',
    'the cut), so the concept is derived from the trade rather than a',
    'generic aesthetic applied from outside. Every section cites the',
    'craft: services, people, place all speak in the same trade register.',
    'Composition: confident single-column and offset moments instead of',
    'the local-business template stack; sections vary between full-bleed',
    'craft imagery and quiet typographic passages, with whitespace used',
    'to give the monochrome imagery room to breathe.',
    'Surface: a committed monochrome world — the page lives in blacks,',
    'whites, and greys as a decision, giving the craft imagery a',
    'documentary weight no trust-blue template could. Flat surfaces are',
    'owned; nothing reads as an unexamined default.',
    'Typography: confident display type in the same reduced palette —',
    'headings carry the gravitas the monochrome world sets up, body',
    'matter stays functional and calm. The restraint IS the character.',
    'Motion + edges: motion is minimal and assured, reveals timed to the',
    'imagery moments; hover and edge surfaces stay in the monochrome',
    'discipline so the register never breaks down the page.',
  ].join('\n'),
  whyExemplar: [
    'The canonical local-service-business reference at award tier: it',
    'proves a barbershop — the direct analogue of an excavator or roofing',
    'contractor — can carry a committed art direction. Teaches that local',
    'trade businesses do not need the "trust-blue template" treatment:',
    'monochrome + craft-as-imagery + confident type is an award-',
    'documented path, and the concept (the trade as the visual system)',
    'transfers to any business whose work is physical. Most competing',
    'local-business pages reach for a blue palette, stock handshake',
    'photography, and a three-card services grid — the exact template',
    "tells this tier exists to reject; Hagis's discipline is the",
    'counterexample.',
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 94,
    hierarchy: 90,
    craftExecution: 91,
    function: 88,
    innovation: 82,
  },
  citationCount: 0,
};
