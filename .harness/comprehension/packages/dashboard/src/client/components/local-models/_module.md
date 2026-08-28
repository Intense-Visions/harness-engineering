---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/local-models'
sourceHash: 'a8cd920ca5e3acfb5d7b563f4dfe9c1b16b9f099494b3fbbfe4f0310cb2d10b9'
compiledAt: '2026-08-28T01:22:11.233Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['HardwareCard.tsx', 'PoolCard.tsx', 'RecommendationsCard.tsx', 'format.ts']
---

## Interface Contract

```ts
export HardwareCard
export PoolCard
export RecommendationsCard
export fmtScore
export round1
```

## Dependency Slice

```
import { InstallProgressState } from '../../hooks/useLocalModelsPanel'
import { DashHardwareProfile, DashPoolEntryView, DashPoolStateView, DashRankedModel } from '../../types/local-models'
import { fmtScore, round1 } from './format'
import { ModelProposalRecord } from '@harness-engineering/types'
import { useCallback, useEffect, useRef, useState } from 'react'
```
