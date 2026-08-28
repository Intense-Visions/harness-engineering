---
schemaVersion: 1
module: 'examples/task-api/src/api'
sourceHash: 'ed04f098ffbfcd9bb1f31c289103cfa8d4a489c6854e8f7fa25dab1be4e18e2e'
compiledAt: '2026-08-28T01:22:08.616Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['routes.ts']
---

## Interface Contract

```ts
export router
```

## Dependency Slice

```
import { completeTask, createTask, getTaskById, listTasks } from '../services/task-service'
import { Router } from 'express'
```
