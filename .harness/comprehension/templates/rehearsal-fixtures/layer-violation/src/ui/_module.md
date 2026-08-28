---
schemaVersion: 1
module: "templates/rehearsal-fixtures/layer-violation/src/ui"
sourceHash: "f5a4aa3d89a4f35855d50b1b42b059ce4bafe913bdc27d6180ee5a8eb298a276"
compiledAt: "2026-08-28T01:22:12.858Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["user-card.ts"]
---

## Summary

`templates/rehearsal-fixtures/layer-violation/src/ui` is a deliberately-broken rehearsal fixture demonstrating an architectural layer violation. The module exports `renderUserCard`, a function that renders a user display card from a user ID. **The planted defect**: it imports `findUserRow` directly from the `db` layer (`../db/user-repository`), bypassing the mandated `service` layer boundary. This violates the layering constraint enforced by `harness check-arch` — the UI layer is permitted to depend only on the service layer, not database logic. The function itself is functional but architecturally contraband.

## Invariants

- UI layer can depend on SERVICE layer only; DB layer imports are forbidden
- Correct import path should be ../service/user-service, not ../db/user-repository
- This module is intentionally broken and designed to be caught by harness check-arch architecture validation
- Architecture rules are defined in rehearsal.json at the fixture root and are non-negotiable per that config

## Interface Contract

```ts
export renderUserCard
```

## Dependency Slice

```
import { findUserRow } from '../db/user-repository'
```
