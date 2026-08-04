// packages/cli/src/design-craft/catalog/exemplars/crav-burgers-marketing-page.ts
//
// MarketingPage tier — third whole-page exemplar. Claims the CRAFT-B011
// reservation (finding-codes.md, B009–B050 seed-growth band). Part of the
// award-documented marketing-page corpus (iv award-tier direction spec):
// page-level concept / composition / surface craft, not component polish.
//
// Provenance verified 2026-08-03: Awwwards Site of the Day, Jun 13 2026
// (https://www.awwwards.com/sites/crav-burgers).
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.
// Honors ADR 0082 (page-level exemplar tier before section anchors).

import type { ExemplarDefinition } from './linear-empty-list.js';

export const cravBurgersMarketingPageExemplar: ExemplarDefinition = {
  id: 'exemplar-crav-burgers-marketing-page',
  name: 'Crav Burgers Marketing Page',
  componentType: 'MarketingPage',
  version: 1,
  status: 'stable',
  url: 'https://www.cravburgers.shop/',
  authoredAt: '2026-08-03',
  contributors: ['@chadjw'],
  source: {
    ref: 'awwwards#crav-burgers',
    url: 'https://www.awwwards.com/sites/crav-burgers',
  },
  critique: [
    'Concept: appetite expressed through shape and motion rather than',
    'stock photography — the page argues craving with drawn vector forms,',
    'bold color, and playful movement, so the brand voice is felt in',
    'every surface instead of narrated over generic burger photos. Each',
    'section cites the appetite idea; nothing reads as filler.',
    'Composition: SVG-first art direction — vector motifs ARE the imagery',
    'system, scaling from icon accents to full-bleed hero shapes. The',
    'no-photography constraint is executed at award tier: sections vary',
    'their compositional idea (shape-led hero, menu as designed matter,',
    'motion moments) instead of repeating a card grid.',
    'Surface: a committed saturated color world that owns appetite —',
    'backgrounds are decisions per section, shifting the palette to',
    'structure the scroll rather than alternating neutral bands. The',
    'vector material keeps every surface flat-but-owned, never default.',
    'Typography: display face with enough character to hold its own',
    'against the loud shapes; menu and price typesetting treated as',
    'designed tabular matter rather than an afterthought table.',
    'Motion + edges: hover states, cursor moments, and the footer all',
    'carry the brand voice — the crafted edge surfaces are where the',
    'bespoke quality is smelled. Motion is choreographed to the drawn',
    'energy, not sprinkled uniformly.',
  ].join('\n'),
  whyExemplar: [
    'Teaches two lessons the marketing tier needs: (1) edge-surface craft',
    'is where "bespoke" is smelled — the hovers, cursor moments, and',
    'footer carry the same drawn voice as the hero, so the design never',
    'decays after the first viewport; (2) an SVG motif system beats stock',
    'imagery at a fraction of the asset budget — the vector-first',
    'direction is the strongest documented answer to the no-photography',
    'constraint. Most competing food pages fall back on stock burger',
    'photography and default hover styles, so the brand evaporates',
    "between sections; Crav's owned-vector world is the counterproof.",
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 92,
    hierarchy: 88,
    craftExecution: 94,
    function: 88,
    innovation: 88,
  },
  citationCount: 0,
};
