---
schemaVersion: 1
module: 'packages/dashboard/tests/client/pages'
sourceHash: 'd13a07738102d9f431cb0d80567275a5be60e44182a116a570fd24103e64dcc2'
compiledAt: '2026-08-28T01:22:11.523Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'Adoption.test.tsx',
    'Attention.test.tsx',
    'DecayTrends.test.tsx',
    'Graph.test.tsx',
    'Health.test.tsx',
    'Impact.test.tsx',
    'Kanban.test.tsx',
    'LocalModels.route.test.tsx',
    'LocalModels.test.tsx',
    'Maintenance.schedule.test.tsx',
    'Maintenance.test.tsx',
    'Orchestrator.test.tsx',
    'Proposals.card.test.tsx',
    'Roadmap.authorIntent.test.tsx',
    'Roadmap.conflict.test.tsx',
    'Routing.empty.test.tsx',
    'Routing.perf.test.tsx',
    'Routing.route.test.tsx',
    'Routing.test.tsx',
    'Signals.test.tsx',
    'Signoff.test.tsx',
    'Streams.test.tsx',
    'Tokens.test.tsx',
    'Webhooks.test.tsx',
  ]
---

## Summary

The `packages/dashboard/tests/client/pages` module contains 24 test files (~4120 lines) covering 19 dashboard page components. Tests are acceptance-level, verifying that each page correctly fetches data from specific API endpoints, transforms and formats it, renders it with proper styling/sorting, and handles user interactions. Tests use global `fetch()` mocking to intercept API calls deterministically, mock orchestrator/SSE hooks to simulate real-time state, and verify data contract compliance, formatting invariants (duration thresholds, percentage rounding, date truncation), and sorting/ordering (by dependency count, delta magnitude, z-score). Error paths test HTTP non-2xx responses and empty/missing states. Pages tested include Adoption, Attention, Impact, Kanban, Orchestrator, Roadmap, Graph, Tokens, Routing, Signals, and others.

## Invariants

- API Response Shapes — Each page consumes a specific API endpoint and expects a fixed TypeScript-typed response shape (e.g., AdoptionSnapshot, OrchestratorSnapshot, AnomalyData). Non-matching shapes cause rendering failures.
- Duration Formatting Thresholds — Milliseconds <1000ms → '500ms'; <60000ms → '1.5s'; ≥60000ms → '1.5m'. Crossing these boundaries changes units; formatter must match exactly.
- Success Rate Color Thresholds — ≥0.8 → emerald-400; ≥0.5 → yellow-400; <0.5 → red-400. UI styling depends on these ranges; off-by-one boundary breaks visual hierarchy.
- Timestamp Truncation — ISO timestamps (e.g., 2026-06-15T12:34:56Z) are truncated to date portion (2026-06-15) for display. Re-renders must apply this consistently.
- Descending Sort Orders — Pages re-sort received data: Adoption by skill name, Impact articulation points by dependentCount DESC, Impact outliers by zScore DESC, Graph node types by count DESC, Decay Trends categories by |delta| DESC. Missing sort reorders rows unexpectedly.
- Direction Arrow Mapping — Decay/impact direction encoded as: improving→↓, declining→↑, stable→→. Symbol must map exactly; wrong arrows confuse risk interpretation.
- HTTP Error Display — Non-2xx fetch responses show 'HTTP {status}' in UI. Pages must expose status code; hiding it breaks observability.
- Empty State Messages — Specific strings shown when data is absent (e.g., 'No adoption data yet...'). Text changes break user workflows; pages assume exact strings in tests.
- Mock Hook Contracts — useOrchestratorSocket returns stable {snapshot, interactions, connected, ...} object with methods like removeInteraction(). Interface drift breaks pages.
- Fetch Router Isolation — Tests install custom fetch routers that route by (url, method) pair and return mutable state. Component behavior depends on re-fetch after mutations (POST then GET). Omitting re-fetch shows stale state.
- Virtuoso Mocking Pattern — Some pages use react-virtuoso for large lists. Tests mock it to render all items (avoiding jsdom viewport issues); if Virtuoso behavior changes, mock must update or tests go blind.
- Category Name Formatting — Hyphenated category IDs are title-cased for display (circular-deps→Circular Deps). Formatter must handle hyphens; breaking it shows raw IDs.

## Interface Contract

```ts

```

## Dependency Slice

```
import { QueueStats } from '../../../src/client/components/webhooks/QueueStatsPanel'
import from '../../../src/client/hooks/useRole'
import { Adoption } from '../../../src/client/pages/Adoption'
import { Attention } from '../../../src/client/pages/Attention'
import { DecayTrends } from '../../../src/client/pages/DecayTrends'
import { Graph } from '../../../src/client/pages/Graph'
import from '../../../src/client/pages/Health'
import { Impact } from '../../../src/client/pages/Impact'
import { Kanban } from '../../../src/client/pages/Kanban'
import { LocalModels } from '../../../src/client/pages/LocalModels'
import { Maintenance } from '../../../src/client/pages/Maintenance'
import { Orchestrator } from '../../../src/client/pages/Orchestrator'
import { Proposals } from '../../../src/client/pages/Proposals'
import from '../../../src/client/pages/Roadmap'
import { Routing } from '../../../src/client/pages/Routing'
import { Signals } from '../../../src/client/pages/Signals'
import { Signoff } from '../../../src/client/pages/Signoff'
import { Streams } from '../../../src/client/pages/Streams'
import { Tokens } from '../../../src/client/pages/Tokens'
import { Webhooks } from '../../../src/client/pages/Webhooks'
import { useThreadStore } from '../../../src/client/stores/threadStore'
import from '../../../src/client/stores/toastStore'
import { MaintenanceEvent, OrchestratorSnapshot, PendingInteraction, RunningAgent } from '../../../src/client/types/orchestrator'
import { SignalResult } from '../../../src/client/types/signals'
import { AgentMeta, SYSTEM_PAGES } from '../../../src/client/types/thread'
import { ArchData, CIData, ChecksData, DashboardFeature, GraphData, GraphUnavailable, HealthData, NodeTypeCount, OverviewData, PerfData, RoadmapData, SecurityData } from '../../../src/shared/types'
import { AuthTokenPublic, MaintenanceHistoryEntry, Proposal, RoutingDecision, SkillProposal, WebhookSubscriptionPublic } from '@harness-engineering/types'
import { AdoptionSnapshot, AnomalyData, BlastRadiusData, SkillAdoptionSummary } from '@shared/types'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
