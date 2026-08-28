---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/roadmap'
sourceHash: 'b48b1064a0511b581022c6e19b236dfaded794717bf6f7960f6b89cf1cf92922'
compiledAt: '2026-08-28T01:22:11.292Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

This module implements the roadmap UI lanes — feature discovery, claiming, and assignment surfaces. It's presentation-only: no endpoints are invented; instead, it wires user interactions through shared utilities (`appendToRoadmap`, `fetchWithConflict`) and the toast store. Core components are `FeatureRow` + `ClaimConfirmation` (claim workflow with phase detection), `AuthorIntentForm` (backlog authoring), `AssignmentHistory` (audit log), and `FeatureTable` + `StatsBar` (aggregated dashboard views). All async operations go through `fetchWithConflict` which returns conflict or success shapes; conflicts surface a toast and preserve form state for retry. Workflow detection (`detectWorkflow`) is deterministic: it maps feature.spec + feature.plan presence to a lane (brainstorming → planning → execution).

## Invariants

- Toast store interface must export pushConflict, pushSuccess, clearSuccess methods; useToastStore is the single source of truth for notifications across all forms
- fetchWithConflict must return { ok, data, externalId } on success or { conflict: { externalId, conflictedWith }, error } on conflict; missing either shape breaks retry/fallback logic
- detectWorkflow(feature) output must be stable (same feature → same workflow every time); used for modal copy and gating the claim action
- AuthorIntentForm preserves title/description on error (not just success); deleting fields on conflict breaks the retry affordance
- DashboardFeature must have at least { name, status, priority, spec?, plan? }; all status values must have STATUS_COLOR entries or badges render as gray fallback
- POST /api/actions/roadmap/claim returns ClaimResponse; the page must re-fetch roadmap on claim success for the new row to surface
- externalIdToUrl is called on row click; must return a URL string or null (null falls back to no-link behavior)

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
