---
schemaVersion: 1
module: 'packages/dashboard/src/client/types'
sourceHash: '3072c5ea0cb67bbfc7e1a26d97e254608a3fc7b0b62cbb6a32cf84e7eea18914'
compiledAt: '2026-08-28T01:22:11.310Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'chat-session.ts',
    'chat.ts',
    'local-models.ts',
    'orchestrator.ts',
    'roles.ts',
    'routing.ts',
    'signals.ts',
    'skills.ts',
    'thread.ts',
  ]
---

## Summary

`packages/dashboard/src/client/types` is a TypeScript type hub for the dashboard UI, organizing client-side data structures across five domains:

1. **Chat infrastructure** — models the conversation UI: `ChatSession` (with local and orchestrator IDs), `ChatMessage` (user/assistant), and `ContentBlock` (thinking, tool use, status, text). Includes `PanelEvent` types for reactive UI updates (todos, status, artifacts, context sources).

2. **Local models mirror** — hand-maintained client mirrors of server-side types from `packages/local-models` and `packages/types` to avoid bundling Node-only dependencies (child_process, system_profiler) into the browser. Includes hardware profiles, pool state/entries, ranked models, and install/pool/proposal events.

3. **Orchestrator snapshot** — real-time state from the orchestrator: running agents, retry queue, token usage, rate limits, and tick activity. Designed for WebSocket broadcasts and agent-monitor rendering.

4. **Interaction context** — enriched spec and complexity scoring for escalated issues: affected systems, transitive deps, test coverage, blast radius, risk level, and recommended routing (local/human/simulation).

5. **Event payloads** — WebSocket event types for maintenance tasks, agent state changes, and model lifecycle events.

## Invariants

- Mirror sync (D-P8-1): Dash\* types are hand-maintained mirrors of server sources (packages/local-models/src/hardware/types.ts, packages/local-models/src/pool/types.ts, packages/types/src/local-models.ts). These must stay synchronized or risk bundle bloat and type drift.
- Delta-only consumption (D-P8-3): LocalModelsPoolEvent and LocalModelsProposalEvent are refetch triggers only—never merged as state in the component. Only LocalModelsInstallEvent carries renderable state (download progress).
- evicted array normalization: In LocalModelsPoolEvent, evicted is uniformly string[] across all emit sites (swap/add list multiple removals; evict wraps single removal); omitted/empty when nothing was evicted.
- PanelEvent routing: Panel events (todo, status, artifact, context-source updates) are mutable session state routed to ContextPanel, not MessageStream.
- Session ID linking: ChatSession.orchestratorSessionId is set after first turn; interactionId links escalated chats to the interaction queue.
- Enriched context is optional: InteractionContext.enrichedSpec and complexityScore may be absent depending on analysis depth.

## Interface Contract

```ts
export *
export DASHBOARD_ROLES
export DEFAULT_ROLE
export DashboardRole
export LocalModelStatus
export NamedLocalModelStatus
export ROLE_LANES
export SYSTEM_PAGES
export coerceRole
export defaultRouteForRole
export isDashboardRole
export laneForRole
export pagesForRole
```

## Dependency Slice

```
import { DASHBOARD_ROLES, DEFAULT_ROLE, DashboardRole, coerceRole, isDashboardRole } from '../../shared/roles'
import { ChatMessage } from './chat'
import { LocalModelsInstallEvent, LocalModelsPoolEvent, LocalModelsProposalEvent } from './local-models'
import { InteractionContext } from './orchestrator'
import { SYSTEM_PAGES, SystemPage } from './thread'
import { BackendDef, BlockerRef, LocalModelStatus, NamedLocalModelStatus, RoutingConfig, RoutingDecision } from '@harness-engineering/types'
```
