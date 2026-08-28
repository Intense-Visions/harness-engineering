---
schemaVersion: 1
module: "templates/rehearsal-fixtures/layer-violation/src/db"
sourceHash: "f05696c6dcd82dd3e037e3835a92287cff85e914e32558eb5d7d91d7ec7591e8"
compiledAt: "2026-08-28T01:22:12.855Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["user-repository.ts"]
---

## Summary

This is a rehearsal fixture (deliberately broken) in the `db` layer that exports a simple in-memory user repository. The module implements a `findUserRow(id: string)` function that retrieves `UserRow` records from a static hardcoded store — designed to violate architectural layer boundaries for testing harness's `check-arch` enforcement.

## Invariants

- Export boundary: findUserRow is the sole public API; the function signature (id: string) → UserRow | undefined is the contract
- Fixture intent: This module deliberately breaks layering rules to exercise harness's architecture validator
- Data shape: UserRow requires {id: string, displayName: string} — callers depend on this structure
- Static store: ROWS is a hardcoded fixture dataset, not a real persistence layer; changes affect all test runs deterministically
- No mutation: The in-memory store is read-only; findUserRow never modifies state

## Interface Contract

```ts
export findUserRow
```

## Dependency Slice

```

```
