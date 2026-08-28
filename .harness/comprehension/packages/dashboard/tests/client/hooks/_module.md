---
schemaVersion: 1
module: 'packages/dashboard/tests/client/hooks'
sourceHash: '93a7c8c1eba596cb161bfc373cd2236cb31b2b4ce0a700c8628ee6466d8b2ad8'
compiledAt: '2026-08-28T01:22:11.470Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

This test suite validates the client's real-time synchronization hooks — the bridge between the orchestrator's running state and the dashboard's thread model. The hooks perform two-phase startup (historical seed from disk via `/api/streams` and `/api/interactions`, then live updates from orchestrator socket), and maintain thread lifecycle as agents execute or interactions block. `useAgentSync` hydrates completed agent sessions, then tracks running agents via snapshot; `useAttentionSync` does the same for pending interactions. Both guard against replay/duplication and respect existing state — if a thread is already live, the seed skips it.

## Invariants

- Hydration is one-shot: /api/streams and /api/interactions fetch exactly once on first mount; rerenders do not retrigger the fetch.
- Existing threads are never clobbered by seeding: if a thread already exists for an issue, the seed skips it and preserves thread state.
- Running vs. completed are separate phases: sessions with endedAt: null are skipped during seed and left for live sync; only completed sessions become threads.
- Live snapshot drives phase transitions: agent phase and backendName updates are applied to existing threads; agents dropping from running set mark their threads completed.
- Store is a singleton with mutable state: thread state, messages map, and hydration flag must be reset between tests to prevent cross-test leakage.
- Non-OK API responses don't block hydration: 5xx or non-2xx responses still call markSourceHydrated and proceed with zero seeded threads; live sync remains active.
- Fresh snapshot object on each render triggers effects: each rerender with a new snapshot reference re-runs live sync logic, enabling real-time updates but requiring care in test construction.

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
