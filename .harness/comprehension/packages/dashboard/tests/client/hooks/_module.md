---
schemaVersion: 1
module: 'packages/dashboard/tests/client/hooks'
sourceHash: '93a7c8c1eba596cb161bfc373cd2236cb31b2b4ce0a700c8628ee6466d8b2ad8'
compiledAt: '2026-08-28T01:22:11.470Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'useAgentSync.test.tsx',
    'useAttentionSync.test.tsx',
    'useChatContext.test.ts',
    'useChatSessionsSync.test.tsx',
    'useLocalModelStatuses.test.ts',
    'useLocalModelsPanel.test.ts',
    'useNotifications.test.ts',
    'useOrchestratorSocket.test.ts',
    'useRoutingConfig.test.tsx',
    'useRoutingDecisions.test.tsx',
    'useSSE.test.ts',
    'useSignals.test.tsx',
    'useStreamReplay.test.tsx',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { useAgentSync } from '../../../src/client/hooks/useAgentSync'
import { useAttentionSync } from '../../../src/client/hooks/useAttentionSync'
import { useChatContext } from '../../../src/client/hooks/useChatContext'
import { useChatSessionsSync } from '../../../src/client/hooks/useChatSessionsSync'
import { useLocalModelStatuses } from '../../../src/client/hooks/useLocalModelStatuses'
import { useLocalModelsPanel } from '../../../src/client/hooks/useLocalModelsPanel'
import { useNotifications } from '../../../src/client/hooks/useNotifications'
import { OrchestratorSocketState, useOrchestratorSocket } from '../../../src/client/hooks/useOrchestratorSocket'
import { useRoutingConfig } from '../../../src/client/hooks/useRoutingConfig'
import { useRoutingDecisions } from '../../../src/client/hooks/useRoutingDecisions'
import { useSSE } from '../../../src/client/hooks/useSSE'
import { useSignals } from '../../../src/client/hooks/useSignals'
import { StreamManifest, useStreamReplay } from '../../../src/client/hooks/useStreamReplay'
import { useThreadStore } from '../../../src/client/stores/threadStore'
import { ChatMessage } from '../../../src/client/types/chat'
import { ChatSession } from '../../../src/client/types/chat-session'
import { DashHardwareProfile, DashPoolStateView, DashRankedModel } from '../../../src/client/types/local-models'
import { InteractionContext, NamedLocalModelStatus, OrchestratorSnapshot, PendingInteraction, RunningAgent } from '../../../src/client/types/orchestrator'
import { RoutingConfigResponse } from '../../../src/client/types/routing'
import { AgentMeta, AttentionMeta } from '../../../src/client/types/thread'
import { SSEEvent } from '../../../src/shared/types'
import { RoutingDecision } from '@harness-engineering/types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
