---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/layout'
sourceHash: '108bd33a23f096efc054d55da06588fa491d9e0444ef160a8fbef35bf137e470'
compiledAt: '2026-08-28T01:22:11.217Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['ChatLayout.tsx', 'ContextPanel.tsx', 'EmptyState.tsx', 'ThreadSidebar.tsx', 'ThreadView.tsx']
---

## Summary

The `layout` module is the three-column orchestrator for the dashboard: left sidebar (thread/system navigation), center main content area, and right context panel. It synchronizes WebSocket events from the orchestrator into React state, persists per-thread panel state (todos, artifacts, context sources, agent stats), and gates panel visibility based on route type (thread vs. system). ChatLayout sets up the grid and syncs agent events via useOrchestratorSocket() hooks, passing them to children through AgentEventsContext. ContextPanel conditionally renders a 320px right sidebar when content is present, sourced from ThreadStore's panelState. Panel state lives in ThreadStore keyed by activeThreadId and survives navigation—the layout reads but never writes. EmptyState is the landing page UI. ThreadSidebar handles role-filtered navigation between threads and system pages.

## Invariants

- System routes (/s/\*) always have null panelState — right panel never renders
- Panel state lives in ThreadStore keyed by activeThreadId, not in ChatLayout — survives navigation by being store-sourced
- AgentEventsContext.Provider wraps the content area and delivers socket.agentEvents to children — all agent subscriptions depend on this context
- ContextPanel renders only when hasContent(state) is true — visibility strictly gated by presence of todos, artifacts, stats, or sources
- Panel state is null-checked to EMPTY_STATE before use — component never crashes on undefined activeThreadId
- Navigation sets isNavigating flag for 800ms to drive progress bar animation — flag lifecycle is load-bearing for visual continuity
- useOrchestratorSocket() and sync hooks must re-subscribe on location changes — stale subscriptions cause missed events in thread context
- Role-based page filtering uses pagesForRole() — if ROLE_LANES or DASHBOARD_ROLES changes, sidebar routes silently break
- Mouse tracking onMouseMove feeds AuraBackground — removal breaks visual effect but not structure
- activeThreadId from ThreadStore determines panel lookup — stale activeThreadId after deletion causes null panelState reads

## Interface Contract

```ts
export AgentEventsContext
export ChatLayout
export ContextPanel
export EmptyState
export SystemRoute
export ThreadRoute
export ThreadSidebar
```

## Dependency Slice

```
import { useAgentSync } from '../../hooks/useAgentSync'
import { useAttentionSync } from '../../hooks/useAttentionSync'
import { useChatSessionsSync } from '../../hooks/useChatSessionsSync'
import { useOrchestratorSocket } from '../../hooks/useOrchestratorSocket'
import { useRole } from '../../hooks/useRole'
import { Adoption } from '../../pages/Adoption'
import { Analyze } from '../../pages/Analyze'
import { Attention } from '../../pages/Attention'
import { DecayTrends } from '../../pages/DecayTrends'
import { Graph } from '../../pages/Graph'
import { Health } from '../../pages/Health'
import { Impact } from '../../pages/Impact'
import { Kanban } from '../../pages/Kanban'
import { LocalModels } from '../../pages/LocalModels'
import { Maintenance } from '../../pages/Maintenance'
import { Orchestrator } from '../../pages/Orchestrator'
import { Proposals } from '../../pages/Proposals'
import { Roadmap } from '../../pages/Roadmap'
import { Routing } from '../../pages/Routing'
import { Signals } from '../../pages/Signals'
import { Signoff } from '../../pages/Signoff'
import { Streams } from '../../pages/Streams'
import { Tokens } from '../../pages/Tokens'
import { Traceability } from '../../pages/Traceability'
import { Webhooks } from '../../pages/Webhooks'
import { InsightsCache } from '../../pages/insights/Cache'
import { getOrCreateDraftChatThread, selectSidebarSections, useThreadStore } from '../../stores/threadStore'
import { ContentBlock } from '../../types/chat'
import { DASHBOARD_ROLES, ROLE_LANES, isDashboardRole, pagesForRole } from '../../types/roles'
import { SkillEntry } from '../../types/skills'
import { SystemPage } from '../../types/thread'
import { AuraBackground } from '../NeonAI/AuraBackground'
import { Sigil } from '../NeonAI/Sigil'
import { CommandPalette } from '../chat/CommandPalette'
import { NeuralOrganism } from '../chat/NeuralOrganism'
import { AgentStats, AgentStatsSection } from '../panel/AgentStatsSection'
import { ArtifactItem, ArtifactsSection } from '../panel/ArtifactsSection'
import { ContextSource, ContextSourcesSection } from '../panel/ContextSourcesSection'
import { StatusSection } from '../panel/StatusSection'
import { TodoItem, TodoSection } from '../panel/TodoSection'
import { SidebarSection } from '../sidebar/SidebarSection'
import { SystemNavItem } from '../sidebar/SystemNavItem'
import { ThreadListItem } from '../sidebar/ThreadListItem'
import { AgentThreadView } from '../threads/AgentThreadView'
import { AnalysisThreadView } from '../threads/AnalysisThreadView'
import { AttentionThreadView } from '../threads/AttentionThreadView'
import { ChatThreadView } from '../threads/ChatThreadView'
import { ContextPanel, PanelState } from './ContextPanel'
import { EmptyState } from './EmptyState'
import { ThreadSidebar } from './ThreadSidebar'
import { AnimatePresence, motion } from 'framer-motion'
import { FlaskConical, PanelRightClose, Plus, Terminal } from 'lucide-react'
import { ComponentType, ReactNode, createContext, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
```
