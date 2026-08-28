---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/maintenance'
sourceHash: '3e1d8a6e9f5ce46dda9ea2dda50068b88c542b6a66b24fafc788971658f46890'
compiledAt: '2026-08-28T01:22:11.271Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'MaintenanceBanners.tsx',
    'MaintenanceContent.tsx',
    'MaintenanceTables.tsx',
    'useMaintenanceData.ts',
  ]
---

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
