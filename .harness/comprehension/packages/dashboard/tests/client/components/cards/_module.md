---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/cards'
sourceHash: '288c3063bd41ddc56d28961f395238171d761710b8bd5989c748257ca40c31d3'
compiledAt: '2026-08-28T01:22:11.413Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'AnalysisFormCard.test.tsx',
    'RoutingChainsCard.test.tsx',
    'RoutingDecisionsCard.test.tsx',
    'RoutingTraceCard.test.tsx',
    'RoutingVolumeCard.test.tsx',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnalysisFormCard } from '../../../../src/client/components/cards/AnalysisFormCard'
import { RoutingChainsCard } from '../../../../src/client/components/cards/RoutingChainsCard'
import { RoutingDecisionsCard } from '../../../../src/client/components/cards/RoutingDecisionsCard'
import { RoutingTraceCard } from '../../../../src/client/components/cards/RoutingTraceCard'
import { RoutingVolumeCard } from '../../../../src/client/components/cards/RoutingVolumeCard'
import { RoutingDecision } from '@harness-engineering/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
