---
schemaVersion: 1
module: 'examples/task-api/tests/services'
sourceHash: 'fe8cb719e100e048f6baa94c0f83e60b4adac5fb5694579485cad7a96f2684c0'
compiledAt: '2026-08-28T01:22:08.620Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['task-service.test.ts']
---

## Summary

`examples/task-api/tests/services` tests the TaskService layer—a lightweight in-memory task store with basic CRUD operations. The suite validates that tasks can be created (auto-assigned an ID, default status `pending`), listed, retrieved by ID, and marked complete. Setup uses `_resetTasks()` to isolate each test, ensuring no state bleed.

## Invariants

- Task identity: Every created task receives a unique `id` and retains its `title` and initial `status: 'pending'`.
- Retrieval safety: `getTaskById()` returns the task object on hit or `undefined` on miss (no thrown errors).
- Isolation: `beforeEach(_resetTasks())` empties the store, so each test starts clean.
- State mutation: `completeTask(id)` mutates the task's status to `'complete'` and returns the updated task.
- In-memory semantics: `listTasks()` reflects all created tasks; no persistence or async I/O involved.

## Interface Contract

```ts

```

## Dependency Slice

```
import { _resetTasks, completeTask, createTask, getTaskById, listTasks } from '../../src/services/task-service'
import { beforeEach, describe, expect, it } from 'vitest'
```
