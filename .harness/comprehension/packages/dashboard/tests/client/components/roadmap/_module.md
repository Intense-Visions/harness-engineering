---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/roadmap'
sourceHash: 'dedca90d562660065f171a1a0137ae07a609f273e6e989b8b00cde449551820f'
compiledAt: '2026-08-28T01:22:11.445Z'
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
