---
schemaVersion: 1
module: "packages/orchestrator/src/completion"
sourceHash: "349b9b7dc6099ca6bdcd88317063fdb4dc2ee0e30b8f69363b4ad1be2b59c662"
compiledAt: "2026-08-28T01:22:12.149Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["handler.ts", "index.ts"]
---

## Summary

The `completion` module handles orchestrator worker-exit lifecycle: recording execution outcomes, posting lifecycle comments, extracting session highlights, and updating the issue tracker. It exports a `CompletionHandler` class that coordinates the full flow via `handleWorkerExit()`: finishes stream recording, records ExecutionOutcome (if pipeline enabled), posts lifecycle comments, extracts highlights to PR, marks issue complete in tracker, applies state-machine exit event, and runs resulting side effects. Task type is inferred from issue labels. Side effects run only on normal completion; error exits skip them entirely. PR linkage is eventual (highlights post regardless; sweep detects PR status later). Tracker and highlight failures are logged but non-fatal.

## Invariants

- Entry data captured once at handleWorkerExit() start and reused throughout; stable reference even as later operations mutate state
- Stream recording finishes before side effects; session stats must be persisted before async operations that might corrupt them
- enrichedSpecsByIssue deleted only on success; retained after error exits so retry attempts can reuse the enriched spec
- Side effects (lifecycle comments, tracker updates, highlights) gated on reason === 'normal'; error exits skip them entirely to avoid partial state
- State-machine event applied before effect execution; applyEvent() determines definitive side-effects list; state updated before handleEffect() runs
- TaskType is label-driven and optional but load-bearing for downstream analytics/routing; no fallback source if pattern-match fails
- PR linkage is best-effort and eventual; branchHasPullRequest() checked but doesn't gate highlight posting; sweep detects PR status asynchronously
- Highlight posting requires externalId; missing externalId silently skips comments to prevent orphaned posts on tracker issues without PRs
- Tracker write-back is non-fatal; markIssueComplete() failures logged as warnings but don't block orchestrator; execution marked complete locally even if tracker unavailable
- Graph store save follows outcome recording; saved only if pipeline enabled and outcome recorded; keeps graph and outcome records synchronized

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
