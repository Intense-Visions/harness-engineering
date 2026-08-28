---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/maintenance'
sourceHash: '6f1f08b2d8131f1f26e464493df516ed4176160128dfcd5999931a03d991967e'
compiledAt: '2026-08-28T01:22:11.410Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['MaintenanceBanners.test.tsx', 'MaintenanceTables.test.tsx']
---

## Summary

This test module validates the **maintenance dashboard UI components** — notification banners and data tables that surface operational status and historical records.

**MaintenanceBanners** tests three overlayable banner types: an in-flight banner naming running tasks (singular or summarized), an error banner reporting failed task IDs with optional details, and a baseref fallback banner signaling local git fallback with per-identity dismissible state.

**MaintenanceTables** tests formatting helpers and two display tables: `formatDuration()` converts milliseconds to human-readable strings with threshold-based precision (ms/s/m), `formatTime()` coerces ISO timestamps to locale strings or em-dash via Date's toLocaleString(), `HistoryTable` renders operation history with color-coded status and findings badges, and `ScheduleTable` displays scheduled tasks and run windows.

## Invariants

- Baseref fallback dismiss identity is keyed on (ref, repoRoot) tuple: same pair stays dismissed across rerenders; different repoRoot resurrects the banner
- formatDuration thresholds: <1000ms → rounded ms; <60s → seconds with .1 decimal; ≥60s → minutes with .1 decimal
- formatTime uses Date.toLocaleString() for determinism, making assertions timezone/locale-agnostic rather than hardcoding expected strings
- HistoryTable findings badge renders only for compound-candidates task with findings > 0; other tasks and zero-finding runs do not show badges
- Status cell colors: failed → text-red-400; success or no-issues → text-emerald-400; skipped → text-yellow-400
- In-flight and error banners render together when both conditions apply; baseref fallback operates independently

## Interface Contract

```ts

```

## Dependency Slice

```
import { MaintenanceBanners } from '../../../../src/client/components/maintenance/MaintenanceBanners'
import { HistoryTable, ScheduleTable, formatDuration, formatTime } from '../../../../src/client/components/maintenance/MaintenanceTables'
import { HistoryEntry, MaintenanceData, ScheduleRow } from '../../../../src/client/components/maintenance/useMaintenanceData'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
