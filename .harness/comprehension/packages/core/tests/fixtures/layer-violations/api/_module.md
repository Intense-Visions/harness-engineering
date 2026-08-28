---
schemaVersion: 1
module: 'packages/core/tests/fixtures/layer-violations/api'
sourceHash: '9c0a47765c9be5b457a9750dc0d31013e73da0883fbe16abc96d976710a09c76'
compiledAt: '2026-08-28T01:22:10.861Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['handler.ts']
---

## Summary

This is a test fixture validating layer-violation detection in the architecture enforcement tooling. The module demonstrates a boundary-crossing import pattern: an `api`-layer handler imports directly from the `domain` layer's user module. The fixture exports a simple `handle()` function that delegates to the domain's `createUser`, establishing a dependency relationship that the architecture validator should flag or permit based on configured rules. This fixture likely exercises either detection of genuine violations or validation of allowed cross-layer imports within a specific architectural model.

## Invariants

- Export contract: Must export `handle` as the public interface for validation detection
- Import path invariant: Imports from `../domain/user` to establish a measurable cross-layer dependency (the violation or allowed-case being tested)
- Fixture role: Lives under `layer-violations/` and serves architecture-checker test coverage—changes to the import path or export name will break validation test assertions
- Shallow delegation: The handler's only behavior is invoking the imported domain function; no side effects or conditional logic that might confound violation detection

## Interface Contract

```ts
export handle
```

## Dependency Slice

```
import { createUser } from '../domain/user'
```
