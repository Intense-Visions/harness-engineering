---
schemaVersion: 1
module: 'packages/core/tests/fixtures/valid-layers/domain'
sourceHash: 'c0cb31ee1bf323c4ab7a180563024d31ba08dd47cfa4639d4a250ef2dd885221'
compiledAt: '2026-08-28T01:22:10.863Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['user.ts']
---

## Summary

**`packages/core/tests/fixtures/valid-layers/domain`** is a minimal domain-layer module defining the core User entity and its factory constructor. It establishes the foundational user concept with no dependencies on other layers, making it a clean example of domain-layer isolation.

## Invariants

- Single public export — `createUser` is the only exported function; the `User` interface is part of the contract via the return type
- No layer dependencies — empty dependency slice; domain has no upward edges to services, API, or infrastructure
- Immutable entity shape — `User` requires exactly two properties (`id: string`, `name: string`), both present at construction time
- Deterministic factory — `createUser(name)` always returns `{id: '1', name}` with a fixed id; suitable as a test fixture
- No side effects — pure function; suitable for dependency injection and testability

## Interface Contract

```ts
export createUser
```

## Dependency Slice

```

```
