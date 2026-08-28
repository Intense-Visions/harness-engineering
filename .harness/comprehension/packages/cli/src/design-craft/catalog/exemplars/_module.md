---
schemaVersion: 1
module: 'packages/cli/src/design-craft/catalog/exemplars'
sourceHash: '142a9f593ee6c8ef53e371c8a413bd321436a43ff5630f2e629cb99034fe11fd'
compiledAt: '2026-08-28T01:22:09.093Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'baillat-studio-marketing-page.ts',
    'commercial-construction-marketing-page.ts',
    'crav-burgers-marketing-page.ts',
    'fort-point-beer-marketing-page.ts',
    'hagis-barbershop-marketing-page.ts',
    'index.ts',
    'kvell-marketing-page.ts',
    'la-revoltosa-marketing-page.ts',
    'linear-empty-list.ts',
    'linear-issue-modal.ts',
    'notion-empty-database.ts',
    'raycast-command-palette.ts',
    'sakazuki-marketing-page.ts',
    'son-daven-marketing-page.ts',
    'stripe-loading-state.ts',
    'stripe-pay-button.ts',
    'vercel-build-progress.ts',
    'vercel-error-state.ts',
  ]
---

## Summary

**Exemplars** is a curated catalog of award-documented design references anchoring the BENCHMARK scoring system. Each exemplar is a real-world component or page that teaches a specific design principle—not a template, but a teachable artifact with verified provenance.

The module exports 17 exemplars across 6 component types:

- **Component-level** (component polish): EmptyState (2), LoadingState (2), ErrorState (1), Modal (1), Button (1), CommandPalette (1)
- **Page-level** (composition/surface/concept): MarketingPage (9)

Each exemplar carries:

- A 5-dimension radar score (philosophicalCoherence, hierarchy, craftExecution, function, innovation) that becomes the baseline when BENCHMARK compares a target design
- Detailed critique broken by discipline (hierarchy, typography, visual, density, motion)
- A `whyExemplar` statement explaining the transferable lesson
- Verified provenance (award citations, live URLs, Internet Archive fallbacks) and contributor attribution

Exemplars land in a fixed array order—`SEED_EXEMPLARS` indices are stable so codes like CRAFT-B001 always refer to the same exemplar even as the array grows horizontally (10 per type → 50 total).

## Invariants

- Verified provenance required: Every exemplar must cite an award site (Awwwards, Manual, Locomotive) or live production URL with fallback to Internet Archive. Live sites are cross-checked against archived captures.
- Radar scores are the comparison baseline: All 5 dimensions must be present (0–100 scale); BENCHMARK uses these to compute delta narratives. An exemplar rarely scores below 70 on principal dimensions or it fails the bar.
- Array order is canonical: SEED_EXEMPLARS indices align 1:1 with finding-code reservations (CRAFT-B001 = index 0); reordering breaks downstream tracking.
- Critique is structured by discipline, not subjective prose: Must include hierarchy, typography, visual/surface, and often density/motion so the LLM can compare structurally against targets.
- Component types are open-ended by contract: ComponentType = string allows new types (Toast, Banner, Card, Page-sections) without schema versioning, but canonical five (EmptyState, LoadingState, ErrorState, Modal, Button) anchor the 50-exemplar plan.
- ADR 0020 compliance: Provenance, contributors, and versioning are non-negotiable—usage signal and growth work depend on persistent identity across the living catalog.
- CitationCount is runtime-mutable: Updated at serve-time by measurement tools when an exemplar is cited in BENCHMARK findings; starts at 0 but changes during execution.
- MarketingPage tier (ADR 0082) is page-scoped: Rubrics and radar dimensions remain the same, but exemplars target whole-page concept/composition/surface, not component polish—separate from component exemplars in teaching scope.

## Interface Contract

```ts
export ComponentType
export ExemplarDefinition
export RadarReference
export SEED_EXEMPLARS
export baillatStudioMarketingPageExemplar
export commercialConstructionMarketingPageExemplar
export cravBurgersMarketingPageExemplar
export fortPointBeerMarketingPageExemplar
export hagisBarbershopMarketingPageExemplar
export kvellMarketingPageExemplar
export laRevoltosaMarketingPageExemplar
export linearEmptyListExemplar
export linearIssueModalExemplar
export notionEmptyDatabaseExemplar
export raycastCommandPaletteExemplar
export sakazukiMarketingPageExemplar
export sonDavenMarketingPageExemplar
export stripeLoadingStateExemplar
export stripePayButtonExemplar
export vercelBuildProgressExemplar
export vercelErrorStateExemplar
```

## Dependency Slice

```
import { Confidence } from '../../findings/schema.js'
import { CatalogSource, CatalogStatus } from '../rubrics/hierarchy-clarity.js'
import { baillatStudioMarketingPageExemplar } from './baillat-studio-marketing-page.js'
import { commercialConstructionMarketingPageExemplar } from './commercial-construction-marketing-page.js'
import { cravBurgersMarketingPageExemplar } from './crav-burgers-marketing-page.js'
import { fortPointBeerMarketingPageExemplar } from './fort-point-beer-marketing-page.js'
import { hagisBarbershopMarketingPageExemplar } from './hagis-barbershop-marketing-page.js'
import { kvellMarketingPageExemplar } from './kvell-marketing-page.js'
import { laRevoltosaMarketingPageExemplar } from './la-revoltosa-marketing-page.js'
import { ExemplarDefinition, linearEmptyListExemplar } from './linear-empty-list.js'
import { linearIssueModalExemplar } from './linear-issue-modal.js'
import { notionEmptyDatabaseExemplar } from './notion-empty-database.js'
import { raycastCommandPaletteExemplar } from './raycast-command-palette.js'
import { sakazukiMarketingPageExemplar } from './sakazuki-marketing-page.js'
import { sonDavenMarketingPageExemplar } from './son-daven-marketing-page.js'
import { stripeLoadingStateExemplar } from './stripe-loading-state.js'
import { stripePayButtonExemplar } from './stripe-pay-button.js'
import { vercelBuildProgressExemplar } from './vercel-build-progress.js'
import { vercelErrorStateExemplar } from './vercel-error-state.js'
```
