---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components'
sourceHash: 'f5c176ec89709aa193c2950ac03ceef935898c9d917ef895d377b4274b7bf7ec'
compiledAt: '2026-08-28T01:22:11.386Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'BlastRadiusGraph.test.tsx',
    'ConflictToastRegion.test.tsx',
    'ProgressChart.test.tsx',
    'SignalCard.test.tsx',
    'Sparkline.test.tsx',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { BlastRadiusGraph, RISK_COLORS, clampOpacity, classifyRisk, computeBlastRadiusLayout } from '../../../src/client/components/BlastRadiusGraph'
import { ConflictToastRegion } from '../../../src/client/components/ConflictToastRegion'
import { ProgressChart } from '../../../src/client/components/ProgressChart'
import { SignalCard } from '../../../src/client/components/SignalCard'
import { Sparkline } from '../../../src/client/components/Sparkline'
import { useToastStore } from '../../../src/client/stores/toastStore'
import { SignalResult } from '../../../src/client/types/signals'
import { STATUS_COLOR } from '../../../src/client/utils/statusColors'
import { BlastRadiusData } from '../../../src/shared/types'
import { MilestoneProgress } from '@shared/types'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
