---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/maintenance'
sourceHash: '2b107fb2dcda53fa59a62954645d62b42ecd49172b7c0608fc20c3c7b9b4fda2'
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
