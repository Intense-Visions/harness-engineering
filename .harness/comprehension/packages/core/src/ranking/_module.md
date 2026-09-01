---
schemaVersion: 1
module: 'packages/core/src/ranking'
sourceHash: '0008cbf09efc7c3eeb59a2f1442eac4116bbf35137ec129728314ddfc3b8694c'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'stability.test.ts', 'stability.ts']
---

## Interface Contract

```ts
export BandValidation
export DEFAULT_CORRELATION_THRESHOLD
export DEFAULT_TIER_COUNT
export RankTier
export RankingWindow
export ScoredItem
export StabilityOptions
export StabilityPresentation
export StabilityReport
export StableRanking
export assignTiers
export checkRankStability
export spearmanRankCorrelation
export validateBands
```

## Dependency Slice

```
import { RankingWindow, ScoredItem, assignTiers, checkRankStability, spearmanRankCorrelation, validateBands } from './stability'
import { describe, expect, it } from 'vitest'
```
