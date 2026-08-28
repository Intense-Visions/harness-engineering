---
schemaVersion: 1
module: 'packages/dashboard/src/client/components'
sourceHash: '2f1d98b5c8c6704785aeedc949b58fc286d784a2a03ef9667bce76010cf2544a'
compiledAt: '2026-08-28T01:22:11.193Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `components` module provides a suite of dashboard UI components for displaying project health, blast radius, and activity signals. It centers on graph visualization (dependency/impact cascades), action buttons with async feedback, and status indicators (KPI cards, progress, signals, staleness). All components are motion-enabled via framer-motion and use a risk-color taxonomy (high/medium/low). Key patterns: ActionButton implements magnetic spring physics + state-machine UI (idle → loading → success|error); BlastRadiusGraph provides a DAG layout engine that positions nodes by depth layers, colors edges by impact probability, and surfaces summary stats; utility exports (risk classification, opacity clamping, layout computation) are factored for reuse.

## Invariants

- Risk classification thresholds are absolute: probability > 0.7 → high, ≥ 0.3 → medium, < 0.3 → low. Callers depend on this for color semantics.
- BlastRadiusGraph layout is deterministic: nodes positioned by depth _ COL_GAP + PADDING.left (x-axis) and rowIndex _ ROW_GAP + PADDING.top (y-axis). Node dimensions (130×30px) are baked into offset calculations; changing them breaks edge routing.
- Opacity range [0.15, 1]: clampOpacity enforces a floor to keep low-probability edges visible. Code depends on this minimum; removing it breaks visual feedback on weak dependencies.
- ActionButton state is sequential: loading blocks re-entry (button disabled); success/error are terminal until component remounts. onSuccess callback fires only on state === 'success' in a single effect; callers must not assume idempotence.
- Edge map is unidirectional: edges list { fromId, toId } and are drawn left-to-right. Circular dependencies are tolerated but will render as straight lines (no cycle detection).

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
