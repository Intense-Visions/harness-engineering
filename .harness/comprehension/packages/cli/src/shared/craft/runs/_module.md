---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/runs'
sourceHash: '9ca18b9a1dd4624375f4ff8e8ce19bec5bef1602160d663544301ede6dc2bb3b'
compiledAt: '2026-08-28T01:22:09.343Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['store.ts']
---

## Summary

`packages/cli/src/shared/craft/runs` is a stateless persistence layer for resumable two-step craft workflows (collect → finalize). It stores JSON snapshots of in-flight run state under `.harness/craft/runs/<runId>.json`, keyed by run ID. Each snapshot captures a versioned schema, the originating skill name, creation timestamp, and skill-specific metadata (opaque to the store). The module handles happy-path persistence (`saveRunState`), retrieval with optional nullability (`loadRunState`), retrieval with skill-name validation and clear error messages (`loadRunStateOrThrow`), and best-effort cleanup: explicit deletion (`deleteRunState`) and TTL-based expiration (`pruneOldRuns` at 24h). Error handling is permissive — parse failures, missing files, and cleanup races are swallowed.

## Invariants

- One file per active run: a single .json file exists per runId at any time. Callers must coordinate cleanup post-finalize; the store does not auto-delete on write collisions.
- Skill ownership is immutable: loadRunStateOrThrow validates that state.skill matches the requested skill. A run initiated by skill A cannot be finalized by skill B — violations throw early with actionable errors.
- Metadata sufficiency contract: the meta field must contain enough information to reconstruct findings from skill responses. This is enforced by callers, not the store — the store is blind to what meta holds.
- 24-hour TTL is advisory, not guaranteed: pruneOldRuns is best-effort and swallows errors. Operators must call it periodically; the store does not run a background timer. Old files may linger.
- Orchestrator owns lifecycle post-finalize: the store persists; the orchestrator deletes after success. There is no transactional guarantee if the orchestrator crashes between finalize and delete — stale files must be tolerated or cleaned by pruneOldRuns.
- Schema version (v) enables forward compatibility: the store always writes v: 1; future versions can use this field to handle older snapshots gracefully.

## Interface Contract

```ts
export deleteRunState
export loadRunState
export loadRunStateOrThrow
export pruneOldRuns
export saveRunState
```

## Dependency Slice

```
import * as fs from 'node:fs'
import * as path from 'node:path'
```
