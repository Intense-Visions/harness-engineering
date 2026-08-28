---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components'
sourceHash: 'f5c176ec89709aa193c2950ac03ceef935898c9d917ef895d377b4274b7bf7ec'
compiledAt: '2026-08-28T01:22:11.386Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'BlastRadiusGraph.test.tsx',
    'ConflictToastRegion.test.tsx',
    'ProgressChart.test.tsx',
    'SignalCard.test.tsx',
    'Sparkline.test.tsx',
  ]
---

## Summary

This test suite validates three critical dashboard components and their utilities:

**BlastRadiusGraph** — A DAG visualization showing downstream impact of a code change. Tests verify layout computation (nodes positioned by depth in columns, edges wired by parentId), risk classification (probability thresholds: >0.7 high, 0.3–0.7 medium, <0.3 low), and SVG rendering of nodes, edges, and summary bars.

**ConflictToastRegion** — An accessible toast notification for concurrent-edit conflicts. Tests ensure role/aria attributes (status + polite + atomic), toast lifecycle (render "Claimed by @user — refresh" or fallback), callback invocation with externalId, and store dismissal.

**ProgressChart** — A stacked milestone-progress bar chart. Tests verify non-backlog-only filtering, geometry constants (LABEL_WIDTH=140, CHART_WIDTH=480, BAR_HEIGHT=20), and color-keyed segment rendering per status.

All components integrate with shared types (BlastRadiusData, MilestoneProgress, SignalResult) and utility constants (RISK_COLORS, STATUS_COLOR).

## Invariants

- Risk threshold boundaries: classifyRisk() returns high for >0.7, medium for 0.3–0.7 (inclusive both), low for <0.3
- Opacity floor enforced: clampOpacity() minimum 0.15, maximum 1.0
- Layout column positioning: source at x=0, depth-N nodes at column N×COL_GAP, all nodes within same depth share x
- Edge-parentId contract: every node's parentId must exist as nodeId in same/prior layer; edges created as {fromId: parentId, toId: nodeId}
- Accessibility markup on toast: role='status', aria-live='polite', aria-atomic='true' required for ARIA compliance
- Toast-store wiring: dismiss calls store.clear(), onRefresh fires once per conflict with externalId
- Backlog-exclusion filter: ProgressChart excludes isBacklog:true milestones; zero non-backlog rows yields no SVG
- SVG node rect count: BlastRadiusGraph renders 2 rects per node (background + stroke); N nodes = 2N rects
- RISK_COLORS constant: {high: '#ef4444', medium: '#f59e0b', low: '#71717a'} used for node fill
- Test fixture seeding: makeTestData probability {0.9, 0.5, 0.2} map to {high, medium, low}; overrides must preserve nested structure

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
