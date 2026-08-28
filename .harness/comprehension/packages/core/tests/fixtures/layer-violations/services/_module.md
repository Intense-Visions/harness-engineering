---
schemaVersion: 1
module: 'packages/core/tests/fixtures/layer-violations/services'
sourceHash: 'b04de139255912eb655a20f1ea27328745cf60d21e7f6357285f992140d691e8'
compiledAt: '2026-08-28T01:22:10.862Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['validation.ts']
---

## Summary

**`packages/core/tests/fixtures/layer-violations/services`** exports a minimal user validation service. The sole public API is `validateUser(name: string): boolean`, which verifies that a name has non-zero length. This fixture exists within the layer-violations test suite and serves as a deliberately placed service-layer module to verify that architectural import boundaries are enforced — it tests that consumers in forbidden layers (e.g., presentation) cannot import from the services layer.

## Invariants

- Export contract is stable: validateUser must remain exported from this module — any removal or renaming breaks layer-violation tests that depend on detecting forbidden cross-layer imports.
- No dependencies on upper layers: The module has zero external dependencies (only uses language builtins), which is essential — introducing a dependency would confound layer-violation test results.
- Placement within services layer is meaningful: Renaming or moving this file out of the services/ directory would invalidate its role as a test fixture for verifying that the architecture prevents certain layers from importing from services.
- Signature remains simple: The function signature (name: string): boolean is the minimal contract; changing it requires updating all test cases that reference this fixture's API.

## Interface Contract

```ts
export validateUser
```

## Dependency Slice

```

```
