---
schemaVersion: 1
module: 'examples/task-api/src/types'
sourceHash: 'c9d9d725f20565dfd2fa03f6ecf248a93d5fa414395ea16d98e8dae665f1ba11'
compiledAt: '2026-08-28T01:22:08.618Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['task.ts']
---

## Summary

`examples/task-api/src/types` defines the core data model for a task management API. It exports three types: a **`TaskStatus`** union of three states (`pending` → `in_progress` → `complete`), a **`Task`** interface representing stored tasks with id, title, description, status, and ISO string timestamp, and a **`CreateTaskInput`** interface for the client payload (title + description only). The server assigns the id, createdAt, and initial status.

## Invariants

- Status is a closed enum: only three states; no other status values are valid
- Task IDs are server-assigned: not part of create input; clients cannot choose IDs
- Timestamps are ISO strings, not Date objects: serialization boundary; assumes RFC 3339 format on read
- Create input is minimal: clients only provide title and description; server controls id, createdAt, and initial status (implicit `pending`)
- No mutations reflected in the type: the `Task` interface represents read state; no `UpdateTaskInput` defined yet (creation-only API so far)

## Interface Contract

```ts

```

## Dependency Slice

```

```
