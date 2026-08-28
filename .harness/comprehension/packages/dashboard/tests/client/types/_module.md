---
schemaVersion: 1
module: 'packages/dashboard/tests/client/types'
sourceHash: '5f864233a8d8b12b1e5e71cf18405bba8490051cda8ef00fb1bc9f4aa031469b'
compiledAt: '2026-08-28T01:22:11.463Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['local-models.test.ts', 'orchestrator.test.ts', 'roles.test.ts', 'thread.test.ts']
---

## Summary

The `packages/dashboard/tests/client/types` module validates four core type contracts: (1) **local-models** tests WebSocket messages and pool state for local model management with disk budgeting and eviction; (2) **orchestrator** tests running agent state, token tracking, and rate limits with proper WebSocket message discrimination; (3) **roles** tests the three-role permission system (dev, pm-ba, client) ensuring each role maps only to valid pages within its lane; (4) **thread** tests the Thread union discriminator with type-specific metadata (ChatMeta, AttentionMeta, AgentMeta, AnalysisMeta, SystemMeta).

## Invariants

- Role taxonomy is immutable: exactly three roles (dev/pm-ba/client), dev is the default, coercion of unknown roles always returns dev
- Page allowlists are valid subsets: every page in ROLE_LANES must exist in SYSTEM_PAGES; non-dev lanes are strict non-empty subsets of the registry
- Default routes are lane-local: each role's defaultRouteForRole() must point to a page within that role's visible lane
- WebSocketMessage types discriminate payloads: 'local-models:pool', 'state_change', 'local-models:proposal' must match their data shapes with no ambiguity
- OrchestratorSnapshot fields are non-optional: token totals, rate limits (requests/tokens per minute/second), concurrent agent cap, and timestamp arrays are required
- Thread.type discriminates metadata: each thread type (chat/attention/agent/analysis/system) carries only its corresponding meta shape; union discriminator is load-bearing
- Pool entries carry optional eviction flag: DashPoolEntryView.pendingEviction is nullable but when present modulates eviction behavior; other fields (ollamaName, sizeOnDiskGb, scores) are required

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
