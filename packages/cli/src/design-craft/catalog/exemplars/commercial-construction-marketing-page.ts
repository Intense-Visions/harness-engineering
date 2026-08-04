// packages/cli/src/design-craft/catalog/exemplars/commercial-construction-marketing-page.ts
//
// MarketingPage tier — ninth whole-page exemplar. Claims the CRAFT-B017
// reservation (finding-codes.md, B009–B050 seed-growth band). Part of the
// award-documented marketing-page corpus (iv award-tier direction spec):
// page-level concept / composition / surface craft, not component polish.
//
// Provenance verified 2026-08-03: Awwwards Honorable Mention, Jun 19 2020
// (https://www.awwwards.com/sites/commercial-construction). The company's
// live site (commercial-construction.in.ua) is no longer online, so the
// award page — which carries the full-page captures — is cited for both
// url and source. The palette description below was cross-checked against
// the Internet Archive capture of the live homepage (2020-08-06): a dark
// grey world (#464646), white type, and a single metallic gold accent
// (#e0a526).
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.
// Honors ADR 0082 (page-level exemplar tier before section anchors).

import type { ExemplarDefinition } from './linear-empty-list.js';

export const commercialConstructionMarketingPageExemplar: ExemplarDefinition = {
  id: 'exemplar-commercial-construction-marketing-page',
  name: 'Commercial Construction Marketing Page',
  componentType: 'MarketingPage',
  version: 1,
  status: 'stable',
  url: 'https://www.awwwards.com/sites/commercial-construction',
  authoredAt: '2026-08-03',
  contributors: ['@chadjw'],
  source: {
    ref: 'awwwards#commercial-construction',
    url: 'https://www.awwwards.com/sites/commercial-construction',
  },
  critique: [
    'Concept: b2b gravitas without template blue — a full-cycle',
    'commercial construction company argued through a near-monochrome',
    'world where the work’s seriousness is the aesthetic. The concept',
    '(built credibility, set in type) lets every section cite it:',
    'services, projects, and credentials all read as entries in one',
    'authoritative ledger.',
    'Composition: credentials and capabilities rendered as designed',
    'typographic tables — licensure, project facts, and company figures',
    'set as tabular matter with real typographic care, giving the inner',
    'sections the same standard as the hero instead of decaying into',
    'bullet lists.',
    'Surface: a committed dark-grey world (#464646 on the archived',
    'build) with white type and ONE metallic gold accent (#e0a526)',
    'reserved for emphasis — a color law, not a palette: the accent',
    'touches credentials and key numbers and is forbidden elsewhere,',
    'which is what makes it read as metal rather than decoration.',
    'Typography: the primary craft surface for a photography-light',
    'trade — confident display sizes for section statements, disciplined',
    'tabular setting for the credential matter, white-on-grey contrast',
    'doing the hierarchy work.',
    'Motion + edges: restrained reveals consistent with the gravitas;',
    'the monochrome + accent law holds through hover states and footer',
    'so the material never breaks register.',
  ].join('\n'),
  whyExemplar: [
    'Teaches the credentials-as-typography move: licensure, bonding,',
    'safety records, and project figures set as designed tabular matter',
    '— directly transferable to excavation and roofing prospects whose',
    'credibility IS the product. Also documents the near-monochrome +',
    'single-metallic-accent color law as an award-recognized path to b2b',
    'gravitas without the trust-blue template. Most competing contractor',
    'pages bury their strongest asset (verifiable credentials) in an',
    'unstyled list under a blue hero with stock hardhat photography;',
    'this page inverts that — the credentials ARE the design — and that',
    'inversion is the lesson.',
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 90,
    hierarchy: 92,
    craftExecution: 90,
    function: 91,
    innovation: 78,
  },
  citationCount: 0,
};
