---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/local-models'
sourceHash: '0d8d0b8505b159c35e00415f319eff305dd91b330c50d5807e88a5fe684d272c'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['HardwareCard.test.tsx', 'PoolCard.test.tsx', 'RecommendationsCard.test.tsx', 'format.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { HardwareCard } from '../../../../src/client/components/local-models/HardwareCard'
import { PoolCard } from '../../../../src/client/components/local-models/PoolCard'
import { RecommendationsCard } from '../../../../src/client/components/local-models/RecommendationsCard'
import { fmtScore, round1 } from '../../../../src/client/components/local-models/format'
import { DashHardwareProfile, DashPoolStateView, DashRankedModel } from '../../../../src/client/types/local-models'
import { ModelProposalRecord } from '@harness-engineering/types'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
