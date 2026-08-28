---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/roadmap'
sourceHash: 'b48b1064a0511b581022c6e19b236dfaded794717bf6f7960f6b89cf1cf92922'
compiledAt: '2026-08-28T01:22:11.292Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'AssignmentHistory.tsx',
    'AuthorIntentForm.tsx',
    'ClaimConfirmation.tsx',
    'FeatureRow.tsx',
    'FeatureTable.tsx',
    'StatsBar.tsx',
    'utils.ts',
  ]
---

## Interface Contract

```ts
export AssignmentHistory
export AuthorIntentForm
export ClaimConfirmation
export EM_DASH
export FeatureRow
export FeatureTable
export StatsBar
export detectWorkflow
export externalIdToUrl
export isWorkable
```

## Dependency Slice

```
import { useToastStore } from '../../stores/toastStore'
import { appendToRoadmap } from '../../utils/appendToRoadmap'
import { fetchWithConflict } from '../../utils/fetchWithConflict'
import { STATUS_COLOR } from '../../utils/statusColors'
import { FeatureRow } from './FeatureRow'
import { ClaimWorkflow, EM_DASH, detectWorkflow, externalIdToUrl, isWorkable } from './utils'
import { ClaimResponse, DashboardAssignmentRecord, DashboardFeature, MilestoneProgress, RoadmapData } from '@shared/types'
import { useState } from 'react'
```
