---
schemaVersion: 1
module: 'packages/dashboard/tests/client/pages'
sourceHash: 'd13a07738102d9f431cb0d80567275a5be60e44182a116a570fd24103e64dcc2'
compiledAt: '2026-08-28T01:22:11.523Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
