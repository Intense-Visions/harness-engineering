---
schemaVersion: 1
module: 'packages/graph/src/context'
sourceHash: '5e5bfb76be853913556d8cba35a9e851ef98f69d353331b8ae6c2dd3c18cd293'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['Assembler.ts', 'StabilityLayout.ts']
---

## Interface Contract

```ts
export Assembler
export CacheEfficiencyMeter
export CacheEfficiencySummary
export LayoutSection
export LayoutViolation
export PrefixStabilityReport
export STABILITY_TIER_LABELS
export StabilityTier
export auditLayout
export estimateNodeTokens
export orderByStability
export stabilityTierForNode
export toLayoutSections
```

## Dependency Slice

```
import { ContextQL } from '../query/ContextQL.js'
import { FusionLayer } from '../search/FusionLayer.js'
import { GraphStore } from '../store/GraphStore.js'
import { VectorStore } from '../store/VectorStore.js'
import { GraphEdge, GraphNode, NodeType } from '../types.js'
import { LayoutSection, orderByStability, toLayoutSections } from './StabilityLayout.js'
```
