---
schemaVersion: 1
module: 'packages/core/src/rollback'
sourceHash: '19ce7e19a5494acc048047a40ef0e2bf46c1ac6efd0e7373fd8def464eb6dc23'
compiledAt: '2026-08-28T01:22:10.571Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['classify.test.ts', 'classify.ts', 'index.ts', 'io.ts', 'types.ts']
---

## Summary

The `rollback` module classifies whether a merged PR can be safely reverted. It combines three gates: (1) conflict detection via dry-running `git revert`; (2) dependent blocking for later-merged PRs touching the same files; (3) migration context warnings (informational only). The classifier returns a `RollbackDecision` with `revertReady` boolean, `action` enum ('proposed'|'blocked'|'skipped'), `dependentMerges` array, `migrationWarnings` context strings, and `reasons` explaining gate failures. Callers inject `RollbackIO.revertDryRun()` for testability; gate order is strict: conflicts short-circuit, then dependents block, else ready.

## Invariants

- Gate sequencing is strict — conflicts short-circuit all other logic; dependent merges only matter if the revert is clean
- Target PR self-exclusion — later merges that are the target PR itself are excluded from dependent detection
- Empty changeset → skip — if no files resolved for the target, return skipped rather than silently proposing
- Unmerged PR → skip — a PR with empty mergeSha cannot be reverted; skip early before calling git
- Migration warnings are context-only — they never flip revertReady or block the action
- Conflict fallback is explicit — if conflictPaths is empty but clean===false, emit 'conflicting paths unavailable' not 'unknown'
- Case-insensitive migration matching with original-casing output — migration patterns match case-insensitively but warnings preserve actual file casing
- File intersection gates dependents — a later merge blocks only if its changedFiles overlap the target's; non-intersecting merges do not block

## Interface Contract

```ts
export ClassifyInput
export LaterMerge
export ResolvedTarget
export RollbackDecision
export RollbackIO
export classifyRevert
```

## Dependency Slice

```
import { classifyRevert } from './classify'
import { RollbackIO } from './io'
import { ClassifyInput, RollbackDecision } from './types'
import { describe, expect, it } from 'vitest'
```
