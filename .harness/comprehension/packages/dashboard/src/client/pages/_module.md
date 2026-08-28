---
schemaVersion: 1
module: 'packages/dashboard/src/client/pages'
sourceHash: '394f78bd14328c937e4b185b8ad368fa7a391c5a5cf024d6a6e4febfdfc96f32'
compiledAt: '2026-08-28T01:22:11.365Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'Adoption.tsx',
    'Analyze.tsx',
    'Attention.tsx',
    'DecayTrends.tsx',
    'Graph.tsx',
    'Health.tsx',
    'Impact.tsx',
    'Kanban.tsx',
    'LocalModels.tsx',
    'Maintenance.tsx',
    'Orchestrator.tsx',
    'Proposals.tsx',
    'Roadmap.tsx',
    'Routing.tsx',
    'Signals.tsx',
    'Signoff.tsx',
    'Streams.tsx',
    'Tokens.tsx',
    'Traceability.tsx',
    'Webhooks.tsx',
  ]
---

## Summary

The `packages/dashboard/src/client/pages` module is a collection of 20 full-page React components that render domain-specific dashboards for the harness orchestration platform. Each page is a thin facade that composes task-specific hooks, stores, and child components to display telemetry, status, or control surfaces for different operational concerns.

**Architecture pattern:** Pages fetch or subscribe to data via custom hooks (useSignals, useMaintenanceData, useOrchestratorSocket) or direct API calls, then render that data through a hierarchy of domain-specific subcomponents. Navigation actions (e.g., "Fix It" buttons, roadmap claims) create chat threads via useThreadStore and navigate to them—pages act as entry points to task workflows, not workflows themselves.

**Data flow:** Adoption, Tokens, and Signals use direct fetch + local useState. Roadmap, Health, and Orchestrator use SSE (useSSE) for live updates. Maintenance and Attention listen to WebSocket events. All follow a consistent load/error/data→render pattern with collapsible sections and drill-down UI.

**Key concerns:** Pages handle real-time connection state (Orchestrator, Maintenance), SSE event ordering (Roadmap conflict toast), and type discrimination (Health's polymorphic section rendering via typeGuards). The Orchestrator page is the most complex, rendering hierarchical agent/workflow status with dynamic phase badges and local-model banners. Tokens manages secure credential display (show-once pattern). Roadmap handles multi-milestone filtering, dependency graphs, and manual claims with conflict resolution.

## Invariants

- Single-export per file: Each .tsx exports exactly one React component named `export function <PageName>()`. No re-exports or subcomponent exports from pages.
- useThreadStore navigation: All action buttons (Fix, Claim, Analyze, etc.) create a chat thread via `useThreadStore.getState().createThread('chat', {...})` and navigate to `/t/${thread.id}`. This is the sole navigation pattern; no <Link> elements.
- State consistency via typeGuards: Pages receiving polymorphic data (Health, Traceability) discriminate sections via `isHealthData()`, `isSecurityData()`, etc. Rendering wrong section type without guard is silent no-op, not error—no defensive checks downstream.
- Async data → state → render: All pages follow load→setData→render. fetch() or hook returns are wrapped in try/catch with setError. No chained async calls without explicit error branches per call.
- No local state mutation beyond hooks: Page local state is useState/useCallback only. Derived state uses useMemo. Side effects are in useEffect or hook internals, never inline in render.
- Empty/loading/error states are disjoint: Render trees check `loading && !snapshot` (not just `loading`) to avoid showing stale data during refetch. Error state persists until next successful load.
- SSE/WebSocket pages log connection state: Orchestrator, Maintenance, Attention expose `connected` or `reconnecting` status in UI (visual dot badge). Absence of this indicator = data freshness not guaranteed.
- Roadmap conflict toast bridges tabs: Roadmap wraps fetch in `fetchWithConflict()` which surfaces POST 409s to a `<ConflictToastRegion>`. No other pages retry conflicts—Roadmap is exception because concurrent claim/author edits are expected.
- No side effects in the page component render: Fetch calls and subscriptions are in useEffect hooks or custom hooks only. Router navigation (useNavigate) is in click handlers, never in render.
- Shared type discrimination: Pages importing `@shared/types` (AdoptionSnapshot, HealthData, etc.) are loosely-typed on the wire. Validation happens at the boundary (API response cast or hook return), not per-render. Malformed data silently renders empty or drops fields—no runtime type errors.

## Interface Contract

```ts
export Adoption
export Analyze
export Attention
export DecayTrends
export Graph
export Health
export Impact
export Kanban
export LocalModels
export Maintenance
export Orchestrator
export Proposals
export Roadmap
export Routing
export Signals
export Signoff
export Streams
export Tokens
export Traceability
export Webhooks
```

## Dependency Slice

```
import { ActionButton } from '../components/ActionButton'
import { BlastRadiusGraph } from '../components/BlastRadiusGraph'
import { ConflictToastRegion } from '../components/ConflictToastRegion'
import { DependencyGraph } from '../components/DependencyGraph'
import { KpiCard } from '../components/KpiCard'
import { ProgressChart } from '../components/ProgressChart'
import { SignalCard } from '../components/SignalCard'
import { StaleIndicator } from '../components/StaleIndicator'
import { AnalyzeForm } from '../components/analyze/AnalyzeForm'
import { AnalyzeResults } from '../components/analyze/AnalyzeResults'
import { AnalyzeEmptyState, AnalyzeError, AnalyzeHeader, AnalyzeStatus } from '../components/analyze/AnalyzeStates'
import { useAnalyze } from '../components/analyze/useAnalyze'
import { AttentionHeader } from '../components/attention/AttentionHeader'
import { AttentionEmpty, AttentionLoading } from '../components/attention/AttentionStates'
import { filterAndSortInteractions, findAttentionThreadId } from '../components/attention/helpers'
import { RoutingChainsCard } from '../components/cards/RoutingChainsCard'
import { RoutingDecisionsCard } from '../components/cards/RoutingDecisionsCard'
import { RoutingTraceCard } from '../components/cards/RoutingTraceCard'
import { RoutingVolumeCard } from '../components/cards/RoutingVolumeCard'
import { AssistantBlocks } from '../components/chat/AssistantBlocks'
import { KanbanLane } from '../components/kanban/KanbanLane'
import { HardwareCard } from '../components/local-models/HardwareCard'
import { PoolCard } from '../components/local-models/PoolCard'
import { RecommendationsCard } from '../components/local-models/RecommendationsCard'
import { MaintenanceBanners } from '../components/maintenance/MaintenanceBanners'
import { MaintenanceContent } from '../components/maintenance/MaintenanceContent'
import { useMaintenanceData } from '../components/maintenance/useMaintenanceData'
import { findAgentThreadId } from '../components/orchestrator/navigation'
import { AssignmentHistory } from '../components/roadmap/AssignmentHistory'
import { AuthorIntentForm } from '../components/roadmap/AuthorIntentForm'
import { ClaimConfirmation } from '../components/roadmap/ClaimConfirmation'
import { FeatureTable } from '../components/roadmap/FeatureTable'
import { StatsBar } from '../components/roadmap/StatsBar'
import { CreateSubscriptionForm, CreatedSecretBanner, CreatedSubscription } from '../components/webhooks/CreateSubscriptionForm'
import { QueueStats, QueueStatsPanel } from '../components/webhooks/QueueStatsPanel'
import { SubscriptionList } from '../components/webhooks/SubscriptionList'
import { useApi } from '../hooks/useApi'
import { useLocalModelsPanel } from '../hooks/useLocalModelsPanel'
import { useNotifications } from '../hooks/useNotifications'
import { useOrchestratorSocket } from '../hooks/useOrchestratorSocket'
import { useRecentSessions } from '../hooks/useRecentSessions'
import { useRole } from '../hooks/useRole'
import { useRoutingConfig } from '../hooks/useRoutingConfig'
import { useRoutingDecisions } from '../hooks/useRoutingDecisions'
import { useSSE } from '../hooks/useSSE'
import { useSignals } from '../hooks/useSignals'
import { StreamManifest } from '../hooks/useStreamReplay'
import { useThreadStore } from '../stores/threadStore'
import { ContentBlock } from '../types/chat'
import { InteractionComplexityScore, InteractionEnrichedSpec, NamedLocalModelStatus, OrchestratorSnapshot, PendingInteraction, RunningAgent, TickActivity } from '../types/orchestrator'
import { AgentMeta } from '../types/thread'
import { fetchWithConflict } from '../utils/fetchWithConflict'
import { deriveLanes, indexBoardIdentifiers } from '../utils/kanban-lanes'
import { scrollToFeatureRow } from '../utils/scrollToFeatureRow'
import { isArchData, isBlastRadiusData, isGraphData, isHealthData, isPerfData, isRoadmapData, isSecurityData } from '../utils/typeGuards'
import { AuthTokenPublic, Proposal, ProposalGateFinding, ProposalStatus, SkillProposal, WebhookSubscriptionPublic } from '@harness-engineering/types'
import { SSE_ENDPOINT } from '@shared/constants'
import { AdoptionSnapshot, AnomalyArticulationPoint, AnomalyData, AnomalyOutlier, ArchData, BlastRadiusData, BlastRadiusResult, CIData, CheckResult, ChecksData, ClaimResponse, DashboardFeature, GraphData, HealthData, MilestoneProgress, OverviewData, PerfData, RoadmapData, SecurityData, SkillAdoptionSummary } from '@shared/types'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { useNavigate } from 'react-router'
import { Virtuoso } from 'react-virtuoso'
import remarkGfm from 'remark-gfm'
```
