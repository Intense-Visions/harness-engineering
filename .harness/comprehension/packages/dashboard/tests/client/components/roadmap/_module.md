---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/roadmap'
sourceHash: '3e04a5f71265b413edbbde7d2fdfb22fc58694ce7f2484744ae76131bfdd67d7'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'AssignmentHistory.test.tsx',
    'AuthorIntentForm.test.tsx',
    'ClaimConfirmation.test.tsx',
    'FeatureRow.test.tsx',
    'FeatureTable.test.tsx',
    'StatsBar.test.tsx',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AssignmentHistory } from '../../../../src/client/components/roadmap/AssignmentHistory'
import { AuthorIntentForm } from '../../../../src/client/components/roadmap/AuthorIntentForm'
import { ClaimConfirmation } from '../../../../src/client/components/roadmap/ClaimConfirmation'
import { FeatureRow } from '../../../../src/client/components/roadmap/FeatureRow'
import { FeatureTable } from '../../../../src/client/components/roadmap/FeatureTable'
import { StatsBar } from '../../../../src/client/components/roadmap/StatsBar'
import { useToastStore } from '../../../../src/client/stores/toastStore'
import { ClaimResponse, DashboardAssignmentRecord, DashboardFeature, MilestoneProgress, RoadmapData } from '../../../../src/shared/types'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
