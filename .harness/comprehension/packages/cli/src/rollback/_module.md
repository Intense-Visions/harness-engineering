---
schemaVersion: 1
module: 'packages/cli/src/rollback'
sourceHash: 'b4cdeb4bc614b322727e8408a8d94341eddc4529ce0a82de0dcaa874b9bae5a3'
compiledAt: '2026-08-28T01:22:09.329Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['breadcrumb.ts', 'compose.ts', 'eval-gate.ts', 'io.ts', 'sweep.ts']
---

## Summary

The `rollback` module implements a two-phase automated rollback pipeline. It comprises four sub-systems:

**Breadcrumb Recording**: Append-only JSONL logging to `.harness/signals/rollback-events.jsonl` capturing rollback decisions (trigger, target PR, action, reason). Graph linking is best-effort and degrade-safe — JSONL is authoritative.

**Revert PR Composition**: Builds revert PRs only when decisions are revert-ready, with full context (trigger, target, blast radius, warnings, dependent merges, reason). Idempotent via `harness:rollback` label. Supports dry-run mode.

**Eval Gate Control**: Feature flag for post-merge eval arm (`rollback.evalTrigger.enabled`), defaulting disabled in v1. CLI self-gates; signal arm unaffected.

**Dry-Run & Git Integration**: In-memory 3-way merge via `git merge-tree --write-tree` to predict conflicts without touching the working tree. Handles mainline parent selection (first parent) for merge commits. Strict exit-code discipline: 1 = conflict, other non-zero = error (re-throw).

## Invariants

- JSONL breadcrumb is the source of truth — even if graph linking fails, the append-only event log survives and drives audit/replay
- Graph linking must be degrade-safe — missing graph store is never a hard error; the app functions without it
- Revert PR label idempotency — a single `harness:rollback` label on the target PR drives the skip check to avoid duplicate PRs
- Exit-code discipline in `git merge-tree` — status 0 = clean, 1 = conflict (recoverable), other = error (re-throw); misclassification breaks dry-run contract
- Mainline parent selection — merge commits revert against parent 1 (`-m 1`), squash/rebase commits against their sole parent
- Eval arm is disabled by default — `rollback.evalTrigger.enabled` must default to false; explicit opt-in is the safety gate
- Append-only event logging — breadcrumb entries are immutable once written; no mutations or deletions
- Best-effort graph linking does not block breadcrumb writes — decoupled failures prevent graph store from becoming a critical path bottleneck

## Interface Contract

```ts
export ROLLBACK_EVENTS_FILE
export ROLLBACK_LABEL
export appendRollbackEvent
export buildRevertBody
export composeRevertPr
export computeRevertDryRun
export createNodeRollbackIO
export createPrResolver
export createTimelineReader
export detectCrossing
export isEvalArmEnabled
export linkRollbackEventToGraph
export parseWindow
export pointsInWindow
export runEvalTriggerIfEnabled
export runRollbackSweep
export windowStart
```

## Dependency Slice

```
import { HarnessConfig } from '../config/schema'
import from '../mcp/utils/graph-loader.js'
import { LaterMerge, ResolvedTarget, RollbackDecision, RollbackIO } from '@harness-engineering/core'
import { SignalId, SignalPoint, SignalTimelineStore } from '@harness-engineering/signals'
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
```
