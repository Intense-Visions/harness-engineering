---
schemaVersion: 1
module: 'examples/task-api/tests/api'
sourceHash: '5ba0920c80bbceead32fa383079e80d482d95503464a43857e5736b3eb46ed7f'
compiledAt: '2026-08-28T01:22:08.619Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['routes.test.ts']
---

## Summary

The `examples/task-api/tests/api` module contains three vitest cases that validate task-service business logic: create + list round-trip, create + complete lifecycle, and empty-state initialization. Tests call the service layer directly (no HTTP mocking), reset state before each case via `_resetTasks()`, and verify that tasks transition through 'pending' → 'complete' status and that list queries reflect created tasks.

## Invariants

- Test isolation via `_resetTasks()` — `beforeEach` wipes state before each case; omitting this breaks test order independence
- Task status defaults to 'pending' — newly created tasks must have `status === 'pending'`; callers rely on this as the initial lifecycle state
- `completeTask()` flips status to 'complete' — the status field is the source of truth for task lifecycle; no partial updates
- `listTasks()` returns an array — even when empty; callers use `.length` and `[0]` indexing
- Task objects have `id`, `title`, `status` fields — tests destructure and compare; adding/removing/renaming any of these breaks assertions
- Service maintains in-memory state within a test — create and list share a single logical store; no persistence between tests (that's what `_resetTasks()` enforces)

## Interface Contract

```ts

```

## Dependency Slice

```
import { _resetTasks, createTask, listTasks } from '../../src/services/task-service'
import { beforeEach, describe, expect, it } from 'vitest'
```
