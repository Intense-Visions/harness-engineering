---
schemaVersion: 1
module: 'packages/dashboard/src/client/pages'
sourceHash: '394f78bd14328c937e4b185b8ad368fa7a391c5a5cf024d6a6e4febfdfc96f32'
compiledAt: '2026-08-28T01:22:11.365Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
