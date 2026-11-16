---
schemaVersion: 1
module: 'packages/dashboard/tests/client/types'
sourceHash: '5d7c5f8a9b6e399aa26818d17e528c3376ff160f7ad44b3d7aa8c6ab7fd10cc2'
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
import { ChatSSEEvent, OrchestratorSnapshot, PendingInteraction, RunningAgent, WebSocketMessage } from '../../../src/client/types/orchestrator'
import { DASHBOARD_ROLES, DEFAULT_ROLE, DashboardRole, ROLE_LANES, coerceRole, defaultRouteForRole, isDashboardRole, laneForRole, pagesForRole } from '../../../src/client/types/roles'
import { AgentMeta, AnalysisMeta, AttentionMeta, ChatMeta, SYSTEM_PAGES, SystemMeta, SystemPage, Thread, ThreadAvatar, ThreadStatus, ThreadType } from '../../../src/client/types/thread'
import { describe, expect, it } from 'vitest'
```
