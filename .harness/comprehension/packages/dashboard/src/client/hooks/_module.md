---
schemaVersion: 1
module: 'packages/dashboard/src/client/hooks'
sourceHash: '0c8ae53aaacfcd0fff6e7cda39926e7309bce5a5fe75cdde4706627169cd7b64'
compiledAt: '2026-08-28T01:22:11.332Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'useAgentSync.ts',
    'useApi.ts',
    'useAttentionSync.ts',
    'useChatContext.ts',
    'useChatSessionsSync.ts',
    'useLocalModelStatuses.ts',
    'useLocalModelsPanel.ts',
    'useNotifications.ts',
    'useOrchestratorSocket.ts',
    'useProjectPulse.tsx',
    'useRecentSessions.ts',
    'useRole.tsx',
    'useRoutingConfig.ts',
    'useRoutingDecisions.ts',
    'useSSE.ts',
    'useSignals.ts',
    'useStreamReplay.ts',
  ]
---

## Summary

`packages/dashboard/src/client/hooks` provides the dashboard's integration layer between live WebSocket state (orchestrator, model status) and persisted server data (sessions, historical runs). The module exports providers for global context (role, pulse) and a collection of synchronized hooks that follow a consistent pattern: hydrate-on-mount from HTTP, then sync live updates via WebSocket. Most hooks feed into a central `useThreadStore` that holds all active and completed agent/chat/attention threads, handling deduplication, state persistence across reloads, and multi-source synchronization.

## Invariants

- Single-pass hydration per hook instance — Each sync hook uses a useRef flag to fetch historical data exactly once on mount; prevents duplicate fetches within a component lifecycle.
- Deduplication by identity — Hooks track seen items (issueId, interactionId, sessionId) in a Set to prevent creating duplicate threads when items appear in consecutive updates.
- ThreadStore is the single source of truth — All hooks route state changes through the same store API (createThread, updateThread, setMessages); ensures consistent state across subscribers.
- Unmount cleanup via mounted flag — Async fetches set a mounted flag to null out setState calls after unmount, preventing memory leaks and spurious updates.
- Socket state is externally managed — Hooks consume OrchestratorSocketState as a prop but never modify it; socket connection/reconnection is a separate concern.
- Stable dependency memoization — useChatContext memoizes the sources key to prevent re-triggering fetch effects; breaking this pattern causes redundant fetches.
- WebSocket updates assume prior hydration — Live WebSocket events update existing threads; hydration must run first, then mark store hydrated, then consume live events to avoid orphaned updates.

## Interface Contract

```ts
export ProjectPulseProvider
export RoleProvider
export useAgentSync
export useApi
export useAttentionSync
export useChatContext
export useChatSessionsSync
export useLocalModelStatuses
export useLocalModelsPanel
export useNotifications
export useOrchestratorSocket
export useProjectPulse
export useRecentSessions
export useRole
export useRoutingConfig
export useRoutingDecisions
export useSSE
export useSignals
export useStreamReplay
```

## Dependency Slice

```
import { useThreadStore } from '../stores/threadStore'
import { ContentBlock } from '../types/chat'
import { ChatSession } from '../types/chat-session'
import { DashHardwareProfile, DashPoolStateView, DashRankedModel } from '../types/local-models'
import { AgentEventMessage, MaintenanceEvent, NamedLocalModelStatus, OrchestratorSnapshot, PendingInteraction, RunningAgent, WebSocketMessage } from '../types/orchestrator'
import { DEFAULT_ROLE, DashboardRole, isDashboardRole } from '../types/roles'
import { RoutingConfigResponse, RoutingDecisionsResponse, RoutingWsStatus } from '../types/routing'
import { SignalsResult } from '../types/signals'
import { AgentMeta, AttentionMeta } from '../types/thread'
import { applyAgentEvent } from '../utils/agent-events'
import { mergeLocalModelStatusByName, mergeLocalModelStatusesFromHttp } from '../utils/local-model-statuses'
import { OrchestratorSocketState } from './useOrchestratorSocket'
import { StreamManifest } from './useStreamReplay'
import { ModelProposalRecord, RoutingDecision } from '@harness-engineering/types'
import { ApiResponse, SSEEvent } from '@shared/types'
import React, { Dispatch, MutableRefObject, ReactNode, SetStateAction, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
```
