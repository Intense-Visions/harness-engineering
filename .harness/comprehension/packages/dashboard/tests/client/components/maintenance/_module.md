---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/maintenance'
sourceHash: '6f1f08b2d8131f1f26e464493df516ed4176160128dfcd5999931a03d991967e'
compiledAt: '2026-08-28T01:22:11.410Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['MaintenanceBanners.test.tsx', 'MaintenanceTables.test.tsx']
---

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
