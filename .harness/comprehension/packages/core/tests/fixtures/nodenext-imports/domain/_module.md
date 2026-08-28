---
schemaVersion: 1
module: 'packages/core/tests/fixtures/nodenext-imports/domain'
sourceHash: 'af7281f89513f16f337e76a6e16810e64237b2236fae8006f55a1f70a101a5f9'
compiledAt: '2026-08-28T01:22:10.862Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['user.ts']
---

## Summary

The `nodenext-imports/domain` module is a minimal domain-layer fixture for testing ES2020+ module resolution. It exports a single `User` interface defining a basic user entity with `id` (string) and `name` (string) properties. This fixture tests the comprehension system's ability to parse TypeScript code using Node.js ESNext import semantics. Semantic analysis is currently absent from the metadata.

## Invariants

- Module exports exactly one member (User interface) with two required string properties (id, name)
- Dependency Slice is empty — no external dependencies or cross-module references
- Source hash (af7281f89513f16f337e76a6e16810e64237b6...) pins exact fixture content; any change to user.ts invalidates baselines
- Members list in \_module.md (['user.ts']) must stay in sync with actual source files or fixture becomes stale
- Semantic analysis is marked absent; fixture may be awaiting analysis or intentionally omitted for test purposes

## Interface Contract

```ts

```

## Dependency Slice

```

```
