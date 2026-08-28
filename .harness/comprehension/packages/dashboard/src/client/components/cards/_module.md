---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/cards'
sourceHash: 'fa9cea28f85e6bb5819f3efeda6f98d6740b54ddd88d33e632faa0cf7a64aa99'
compiledAt: '2026-08-28T01:22:11.206Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'AnalysisFormCard.tsx',
    'BriefingCard.tsx',
    'RoutingChainsCard.tsx',
    'RoutingDecisionsCard.tsx',
    'RoutingTraceCard.tsx',
    'RoutingVolumeCard.tsx',
  ]
---

## Interface Contract

```ts
export AnalysisFormCard
export BriefingCard
export RoutingChainsCard
export RoutingDecisionsCard
export RoutingTraceCard
export RoutingVolumeCard
```

## Dependency Slice

```
import { InteractionComplexityScore, InteractionEnrichedSpec, PendingInteraction } from '../../types/orchestrator'
import { RoutingTraceResponse, RoutingWsStatus } from '../../types/routing'
import { RoutingDecision, RoutingUseCase } from '@harness-engineering/types'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, ChevronDown, FlaskConical, Send, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
```
