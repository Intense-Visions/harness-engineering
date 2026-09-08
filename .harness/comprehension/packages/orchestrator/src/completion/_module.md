---
schemaVersion: 1
module: 'packages/orchestrator/src/completion'
sourceHash: '0601fa00f2a66060831d88e24ca2e8f037990b818ce18cfa1b56f941c0ce96c6'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['handler.ts', 'index.ts']
---

## Interface Contract

```ts
export CompletionHandler
export PostLifecycleCommentFn
```

## Dependency Slice

```
import { extractHighlights, renderPRComment } from '../core/highlight-extractor'
import { applyEvent } from '../core/state-machine'
import { OrchestratorEvent, SideEffect } from '../types/events'
import { OrchestratorContext } from '../types/orchestrator-context'
import { GitHubIssuesSyncAdapter, loadTrackerSyncConfig } from '@harness-engineering/core'
import { ExecutionOutcome } from '@harness-engineering/intelligence'
import * as path from 'node:path'
```
