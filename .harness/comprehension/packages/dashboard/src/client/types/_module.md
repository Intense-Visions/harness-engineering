---
schemaVersion: 1
module: 'packages/dashboard/src/client/types'
sourceHash: '3072c5ea0cb67bbfc7e1a26d97e254608a3fc7b0b62cbb6a32cf84e7eea18914'
compiledAt: '2026-08-28T01:22:11.310Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
