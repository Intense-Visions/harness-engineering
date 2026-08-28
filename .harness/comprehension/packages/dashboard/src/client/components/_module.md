---
schemaVersion: 1
module: 'packages/dashboard/src/client/components'
sourceHash: '2f1d98b5c8c6704785aeedc949b58fc286d784a2a03ef9667bce76010cf2544a'
compiledAt: '2026-08-28T01:22:11.193Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'ActionButton.tsx',
    'BlastRadiusGraph.tsx',
    'ConflictToastRegion.tsx',
    'DependencyGraph.tsx',
    'KpiCard.tsx',
    'ProgressChart.tsx',
    'SignalCard.tsx',
    'Sparkline.tsx',
    'StaleIndicator.tsx',
  ]
---

## Interface Contract

```ts
export ActionButton
export BlastRadiusGraph
export ConflictToastRegion
export DependencyGraph
export KpiCard
export ProgressChart
export RISK_COLORS
export SignalCard
export Sparkline
export StaleIndicator
export clampOpacity
export classifyRisk
export computeBlastRadiusLayout
```

## Dependency Slice

```
import { CONFLICT_TOAST_TEMPLATE } from '../../shared/types'
import { useApi } from '../hooks/useApi'
import { useToastStore } from '../stores/toastStore'
import { SignalPoint, SignalResult, SignalStatus } from '../types/signals'
import { STATUS_COLOR } from '../utils/statusColors'
import { Sparkline } from './Sparkline'
import { BlastRadiusData, BlastRadiusNode, DashboardFeature, FeatureStatus, MilestoneProgress } from '@shared/types'
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
```
