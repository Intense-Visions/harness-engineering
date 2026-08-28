---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/roadmap'
sourceHash: 'dedca90d562660065f171a1a0137ae07a609f273e6e989b8b00cde449551820f'
compiledAt: '2026-08-28T01:22:11.445Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `packages/dashboard/tests/client/components/roadmap` module tests three core roadmap UI components. **AssignmentHistory** displays a read-only table of feature assignment events with color-coded actions (assigned=blue, completed=green, unassigned=gray); renders nothing for empty records. **AuthorIntentForm** is a controlled form for submitting roadmap items to `POST /api/roadmap/append`; trims inputs, omits empty summary, disables submit on empty title, clears fields + toasts on success, preserves inputs + conflict toast on 409. **ClaimConfirmation** is a claim dialog that detects workflow stage (brainstorming if no spec/em-dash spec; planning if spec exists but no plans/em-dash plans) and displays feature/identity context. All three use mocked `fetch`, Vitest, and React Testing Library with `useToastStore` for feedback.

## Invariants

- Title guard: submit button disabled for empty or whitespace-only title; form submit itself guarded (no fetch issued)
- Trimming: input values must be trimmed before posting to /api/roadmap/append
- Conditional summary: summary field omitted from request body if description is empty; never posted as null or empty string
- Empty records render: AssignmentHistory returns empty HTML ('') when records array is empty, not placeholder or null message
- Conflict preserves state: on 409 response, form inputs unchanged and onCreated NOT fired; conflict toast (with externalId + conflictedWith) shown instead of success
- Action color classes: exact Tailwind classes required — text-blue-400 (assigned), text-emerald-400 (completed), text-gray-400 (unassigned)
- Workflow detection: brainstorming = no spec OR spec is em-dash (—); planning = spec exists AND (no plans OR plans is em-dash); mutual exclusivity enforced

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
