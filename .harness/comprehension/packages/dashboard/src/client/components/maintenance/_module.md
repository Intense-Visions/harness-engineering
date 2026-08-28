---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/maintenance'
sourceHash: '3e1d8a6e9f5ce46dda9ea2dda50068b88c542b6a66b24fafc788971658f46890'
compiledAt: '2026-08-28T01:22:11.271Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'MaintenanceBanners.tsx',
    'MaintenanceContent.tsx',
    'MaintenanceTables.tsx',
    'useMaintenanceData.ts',
  ]
---

## Summary

This module provides a real-time dashboard for monitoring scheduled maintenance tasks and their execution history. It connects to the orchestrator socket to display task schedules, current in-flight runs, and historical execution records. MaintenanceContent orchestrates the layout across KPI cards, a schedule table (with manual "Run Now" triggers), and a history table. MaintenanceBanners shows transient alerts including in-flight task counts, task failures, and dismissible baseref fallback warnings. HistoryTable and ScheduleTable render the dual-purpose data views with status color-coding and memoized rows for performance. Utilities format durations and ISO timestamps for display.

## Invariants

- In-flight Set membership is the single source of truth for task execution state; stale membership causes UI to show stale button states or allow re-trigger while executing
- BaserefFallbackBanner dismissed state uses (ref, repoRoot) tuple as identity; new fallback with different tuple re-appears the banner, covering multi-worktree scenarios
- statusAccent() function maps exactly three status types (success/no-issues→green, failed→red, others→yellow); new HistoryEntry statuses added without updating this map render wrong colors
- compound-candidates task type is hard-coded for findings badge display; task naming drift or semantic changes cause badge to silently disappear with no fallback
- HistoryTable row keys use ${task}-${startedAt}-${i}; multiple tasks with same startedAt millisecond will collide, requiring sufficient timestamp granularity
- Empty state rendering branches on length===0; null vs [] mismatch skips the empty message and shows an empty table shell instead
- formatTime returns '—' for null ISO strings; callers don't enforce non-null contracts, causing display drift on mismatched null assumptions
- useMaintenanceData hook must gracefully handle orchestrator socket disconnects; no explicit error boundary shown in module; stale data can persist if hook doesn't recover

## Interface Contract

```ts
export HistoryTable
export MaintenanceBanners
export MaintenanceContent
export ScheduleTable
export formatDuration
export formatTime
export useMaintenanceData
```

## Dependency Slice

```
import { useOrchestratorSocket } from '../../hooks/useOrchestratorSocket'
import { KpiCard } from '../KpiCard'
import { HistoryTable, ScheduleTable, formatTime } from './MaintenanceTables'
import { HistoryEntry, MaintenanceData, ScheduleRow, SchedulerStatus } from './useMaintenanceData'
import { MaintenanceHistoryEntry } from '@harness-engineering/types'
import { memo, useCallback, useEffect, useState } from 'react'
```
