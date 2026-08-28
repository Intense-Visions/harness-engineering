---
schemaVersion: 1
module: 'packages/dashboard/tests/client/types'
sourceHash: '5f864233a8d8b12b1e5e71cf18405bba8490051cda8ef00fb1bc9f4aa031469b'
compiledAt: '2026-08-28T01:22:11.463Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['local-models.test.ts', 'orchestrator.test.ts', 'roles.test.ts', 'thread.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { DashHardwareProfile, DashPoolEntryView, DashPoolStateView, DashRankedModel, LocalModelsPoolEvent, LocalModelsProposalEvent } from '../../../src/client/types/local-models'
import { ChatSSEEvent, OrchestratorSnapshot, PendingInteraction, RunningAgent, TokenTotals, WebSocketMessage } from '../../../src/client/types/orchestrator'
import { DASHBOARD_ROLES, DEFAULT_ROLE, DashboardRole, ROLE_LANES, coerceRole, defaultRouteForRole, isDashboardRole, laneForRole, pagesForRole } from '../../../src/client/types/roles'
import { AgentMeta, AnalysisMeta, AttentionMeta, ChatMeta, SYSTEM_PAGES, SystemMeta, SystemPage, Thread, ThreadAvatar, ThreadStatus, ThreadType } from '../../../src/client/types/thread'
import { describe, expect, it } from 'vitest'
```
