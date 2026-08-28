---
schemaVersion: 1
module: "templates/rehearsal-fixtures/layer-violation/src/service"
sourceHash: "7078093ec79f5cad7d7e36fbd5d9117caa8b3a3ce3b98e02149e94c889f8e989"
compiledAt: "2026-08-28T01:22:12.858Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["user-service.ts"]
---

## Summary

This is a deliberately broken service-layer module designed to test architectural validation (`harness check-arch`). It exposes a `getUser` function that retrieves user data and maps database rows to a public `User` interface, renaming fields as needed. The violation: the service layer directly imports from the data layer (`../db/user-repository`), breaking the intended dependency constraint that UI→Service→*DB* path not skip intermediate abstractions.

## Invariants

- Single public export: only `getUser` function is exported; `User` interface is part of the public contract
- Direct db-layer dependency: imports `findUserRow` from `../db/user-repository` — the architectural violation the fixture tests
- Layer identity: module location `src/service/` marks it as the service layer; UI is the only layer permitted to depend on it
- Null-safe mapping: function returns `undefined` when the database row is absent, not throwing
- Field transformation: db schema (`displayName`) maps to domain model (`name`), modeling real-world schema divergence

## Interface Contract

```ts
export getUser
```

## Dependency Slice

```
import { findUserRow } from '../db/user-repository'
```
