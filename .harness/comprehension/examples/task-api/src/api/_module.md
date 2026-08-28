---
schemaVersion: 1
module: 'examples/task-api/src/api'
sourceHash: 'ed04f098ffbfcd9bb1f31c289103cfa8d4a489c6854e8f7fa25dab1be4e18e2e'
compiledAt: '2026-08-28T01:22:08.616Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['routes.ts']
---

## Summary

`examples/task-api/src/api` is a thin HTTP route layer exporting an Express router with four task endpoints. It delegates all data operations to the task-service layer while handling HTTP concerns: request validation (title required on POST), response status codes (201 on create, 404 on missing), and JSON serialization. The API surface is straightforward CRUD: create, list, get by ID, and mark complete.

## Invariants

- All data reads/mutations flow through task-service functions; no direct data access in routes
- POST /tasks must reject requests lacking `title` with a 400 error; description defaults to empty string if omitted
- GET by ID and PATCH complete return 404 with an error object when the task ID doesn't exist
- POST returns 201 (created); all successful reads/updates return 200 implicitly
- Only the router is exported; route handlers are internal implementation detail

## Interface Contract

```ts
export router
```

## Dependency Slice

```
import { completeTask, createTask, getTaskById, listTasks } from '../services/task-service'
import { Router } from 'express'
```
