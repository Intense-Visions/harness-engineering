---
schemaVersion: 1
module: 'packages/cli/tests/rollback'
sourceHash: 'b05ea64fcca2af3f46db8d34c74ecf43b40e5fcf7a102cb46b9ec8fb5f0ef00b'
compiledAt: '2026-08-28T01:22:09.941Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'breadcrumb.test.ts',
    'compose.test.ts',
    'eval-gate.test.ts',
    'io.test.ts',
    'sweep.test.ts',
    'workflow-yaml.test.ts',
  ]
---

## Summary

**`packages/cli/tests/rollback`** tests the automated rollback system that detects problematic PRs via signals and proposes reversions. The module validates a multi-stage pipeline: signal anomaly detection → merge-tree dry-run conflict analysis → GitHub revert PR composition → JSONL breadcrumb logging.

The system is **opt-in and gated**: signal-based and eval-based triggers are configuration-controlled; evaluation triggers default to disabled. Revert decisions must be marked `revertReady: true` to proceed. The module tests both **live and dry-run modes**, mock Git operations extensively (using a `GitSeam` interface), and exercise idempotency to ensure repeated calls are safe.

Key flows tested:

- **Breadcrumb**: JSONL event log with append-only semantics (never overwrites)
- **Compose**: GitHub PR creation with idempotency (skips if open revert PR already exists)
- **Eval gate**: Config-gated evaluation trigger (disabled by default)
- **IO (Git)**: Dry-run conflict detection via `merge-tree` with proper parent-selection for squash vs. merge commits
- **Sweep**: Time-window signal crossing detection (threshold breaches trigger evaluation)

## Invariants

- Append-only breadcrumb: appendRollbackEvent appends to JSONL, never overwrites. Multiple calls produce multiple records.
- Idempotent PR composition: composeRevertPr checks for existing open revert PR before creating. Repeated calls return the existing PR (action: 'skipped') without opening a new one.
- Revert-ready gate: Composition only proceeds when revertReady: true. Blocked decisions return action: 'blocked' without creating PRs.
- Conflict vs. error distinction: merge-tree exit code 1 = conflict (reported cleanly with conflictPaths). Exit codes 128+ are transient/real errors and must propagate — never silently reported as conflicts.
- Parent selection correctness: Two-parent (merge) commits use parent 1 (^1). Single-parent (squash/rebase) commits use the sole parent. Incorrect parent selection breaks revert semantics.
- Signal crossing requires both edges: Plateau (all points above or all below threshold) = no crossing. Crossing requires a prior point on one side and latest point on the other. Empty or single-point windows return false.
- Window filtering is time-inclusive: pointsInWindow includes points in [now - window, now] with millisecond precision. Exact boundary points are included.
- Eval arm disabled by default: isEvalArmEnabled returns false when rollback is undefined or evalTrigger.enabled: false. Enabled evaluation triggers must opt-in explicitly.
- Degrade-safe graph linking: linkRollbackEventToGraph is a no-op if no graph exists; does not error when missing infrastructure.

## Interface Contract

```ts

```

## Dependency Slice

```
import { HarnessConfig } from '../../src/config/schema'
import { ROLLBACK_EVENTS_FILE, appendRollbackEvent, linkRollbackEventToGraph } from '../../src/rollback/breadcrumb'
import { ROLLBACK_LABEL, buildRevertBody, composeRevertPr } from '../../src/rollback/compose'
import { isEvalArmEnabled, runEvalTriggerIfEnabled } from '../../src/rollback/eval-gate'
import { GitSeam, computeRevertDryRun } from '../../src/rollback/io'
import { SweepSignalRule, createPrResolver, detectCrossing, parseWindow, pointsInWindow, runRollbackSweep, windowStart } from '../../src/rollback/sweep'
import { RollbackDecision } from '@harness-engineering/core'
import { SignalPoint } from '@harness-engineering/signals'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
```
