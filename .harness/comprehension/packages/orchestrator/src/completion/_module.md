---
schemaVersion: 1
module: 'packages/orchestrator/src/completion'
sourceHash: '349b9b7dc6099ca6bdcd88317063fdb4dc2ee0e30b8f69363b4ad1be2b59c662'
compiledAt: '2026-08-28T01:22:12.149Z'
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
