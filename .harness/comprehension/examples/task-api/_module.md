---
schemaVersion: 1
module: 'examples/task-api'
sourceHash: '64e862d333fdf608b83cb50ecef43d670054b984475cb6c276478929b3d6a7e7'
compiledAt: '2026-08-28T01:22:08.608Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['eslint.config.mjs']
---

## Summary

**task-api** is an intermediate-level harness engineering example — a minimal REST API for task management built with Express and TypeScript. Its purpose is to demonstrate mechanical enforcement of layered architecture via the harness eslint plugin.

The API exposes four endpoints for in-memory task CRUD: create, list, retrieve, and mark complete. The architecture enforces three strict layers (api → services → types) with compile-time violations caught by the `no-layer-violation` eslint rule. The service layer owns all business logic and state; routes delegate to services; types are leaf imports only and must never import upward.

## Invariants

- Layer isolation is enforced mechanically by eslint no-layer-violation rule reading harness.config.json; must not be bypassed or disabled
- Service layer (task-service.ts) is the single source of truth for task store; routes must only call exported service functions, never directly mutate state
- Types layer (types/task.ts) exports interfaces only and must never import from services or api to prevent circular dependencies
- Route handlers parse/validate HTTP input then delegate to services; business logic lives in services, not routes
- Pre-commit hooks block no-verify and force-push to ensure architectural constraints remain enforced across all commits

## Interface Contract

```ts
export default
```

## Dependency Slice

```
import harnessPlugin from '@harness-engineering/eslint-plugin'
```
