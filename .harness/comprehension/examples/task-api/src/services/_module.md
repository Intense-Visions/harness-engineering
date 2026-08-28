---
schemaVersion: 1
module: 'examples/task-api/src/services'
sourceHash: 'c62a4fa4192eb479606a27528e92a7b208d29ae2dd20bd611d2485ed38f43d55'
compiledAt: '2026-08-28T01:22:08.617Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['task-service.ts']
---

## Summary

The task-service module implements a simple in-memory task store with CRUD operations. Tasks are stored in a module-scoped array with auto-incrementing string IDs. New tasks are created in `pending` status and can transition to `complete` via `completeTask()`. The service returns a defensive shallow copy for list operations but mutates tasks in-place for updates. All state is ephemeral and resets on process restart or test cleanup.

## Invariants

- Session-local ephemeral state: All data lives in a module-scoped array; resets on process restart or \_resetTasks() call
- String IDs are auto-incremented: Tasks get unique string IDs via a module-level counter; ID generation is not re-entrant-safe
- No error states: getTaskById() and completeTask() return undefined if task doesn't exist; they do not throw
- Defensive copy on read, mutation on write: listTasks() returns a shallow copy; completeTask() mutates the task object in-place
- No input validation: createTask() accepts any CreateTaskInput and stores it as-is without validating required fields
- Status field is binary: Only 'pending' (initial) and 'complete' (via explicit update) are valid states from the API
- Timestamps are ISO strings: createdAt is always set to new Date().toISOString() at creation time; no update-time tracking

## Interface Contract

```ts
export _resetTasks
export completeTask
export createTask
export getTaskById
export listTasks
```

## Dependency Slice

```
import { CreateTaskInput, Task, TaskStatus } from '../types/task'
```
