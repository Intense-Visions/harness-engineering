---
schemaVersion: 1
module: 'packages/cli/src/design-craft/catalog/patterns'
sourceHash: '8bccbedd6420a5d1c2a5832a98bc82e980fc7ad4c8b5c4c700f1a53f9a40b36f'
compiledAt: '2026-08-28T01:22:09.015Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'editorial-two-column-split.ts',
    'fluid-type-scale.ts',
    'focus-ring-craft.ts',
    'index.ts',
    'page-transition-crossfade.ts',
    'progressive-corner-rounding.ts',
    'skeleton-content-matched.ts',
    'spring-physics.ts',
    'stagger-timing.ts',
  ]
---

## Interface Contract

```ts
export PatternApplicability
export PatternDefinition
export SEED_PATTERNS
export editorialTwoColumnSplitPattern
export fluidTypeScalePattern
export focusRingCraftPattern
export pageTransitionCrossfadePattern
export progressiveCornerRoundingPattern
export skeletonContentMatchedPattern
export springPhysicsPattern
export staggerTimingPattern
```

## Dependency Slice

```
import { FindingPhase, Impact, Tier } from '../../findings/schema.js'
import { CatalogSource, CatalogStatus, FindingTemplate } from '../rubrics/hierarchy-clarity.js'
import { editorialTwoColumnSplitPattern } from './editorial-two-column-split.js'
import { fluidTypeScalePattern } from './fluid-type-scale.js'
import { focusRingCraftPattern } from './focus-ring-craft.js'
import { pageTransitionCrossfadePattern } from './page-transition-crossfade.js'
import { progressiveCornerRoundingPattern } from './progressive-corner-rounding.js'
import { skeletonContentMatchedPattern } from './skeleton-content-matched.js'
import { PatternDefinition, springPhysicsPattern } from './spring-physics.js'
import { staggerTimingPattern } from './stagger-timing.js'
```
