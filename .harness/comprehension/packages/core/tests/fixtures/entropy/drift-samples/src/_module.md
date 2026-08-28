---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/drift-samples/src'
sourceHash: '3e71b587d00fd94557fb106c65c1ffbf2b2b327a657e36b9e3924ff64e62b1b4'
compiledAt: '2026-08-28T01:22:10.858Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'user.ts']
---

## Summary

Minimal test fixture providing stub user operations: `findUserById` (always returns null) and `createNewUser` (factory returning object with hardcoded id='1' and provided name). Intentionally incomplete code used to validate drift-detection or entropy-analysis tooling.

## Invariants

- Barrel re-export contract: both functions exported from index.ts, sourced from user.ts
- findUserById signature: accepts id: string, returns null (stub implementation, not user object)
- createNewUser signature: accepts name: string, returns {id: '1', name} with hardcoded id
- Intentional incompleteness: static id and non-functional findUserById are features for drift detection testing, not bugs
- No auxiliary code: fixture remains minimal with no utilities, type definitions, or side effects that would complicate analysis

## Interface Contract

```ts
export createNewUser
export findUserById
```

## Dependency Slice

```

```
