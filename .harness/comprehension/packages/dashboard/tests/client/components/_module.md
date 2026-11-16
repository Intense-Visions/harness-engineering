---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components'
sourceHash: 'f0e90bbb1e46ad489662fb058621c0318b3efa16caa7c517f913f6e7d3bc025e'
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
