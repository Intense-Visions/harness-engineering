---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/pattern-samples/src/services'
sourceHash: '3cf2512a45342d9c5e1458c4dc02bf75e22e768e4ee6753afb6d5034dcd8e8d6'
compiledAt: '2026-08-28T01:22:10.859Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['bad-service.ts', 'user-service.ts']
---

## Summary

This fixture demonstrates service-layer pattern enforcement for entropy validation. BadService exports a function (violating the pattern), while UserService exports a default class (compliant). The fixture is used by pattern validators to verify they correctly flag violations and accept canonical service structures.

## Invariants

- Services must export a default class, not factory functions or plain objects
- BadService is intentionally non-compliant to test violation detection; its presence is load-bearing to the test
- UserService is the canonical target shape that pattern validators must accept
- Both compliant and non-compliant forms must coexist; removing either breaks the comparison the fixture enables

## Interface Contract

```ts
export BadService
export UserService
export default
```

## Dependency Slice

```

```
