---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/local-models'
sourceHash: 'ca2caafb2d1989917e1924c01cfe87c50c591e5276e27ef906262dc401f7b53a'
compiledAt: '2026-08-28T01:22:11.416Z'
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
