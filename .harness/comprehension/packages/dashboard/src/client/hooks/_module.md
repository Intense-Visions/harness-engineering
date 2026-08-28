---
schemaVersion: 1
module: 'packages/dashboard/src/client/hooks'
sourceHash: '0c8ae53aaacfcd0fff6e7cda39926e7309bce5a5fe75cdde4706627169cd7b64'
compiledAt: '2026-08-28T01:22:11.332Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
