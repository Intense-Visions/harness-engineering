---
schemaVersion: 1
module: 'packages/core/tests/fixtures/layer-violations/domain'
sourceHash: '1a4a6a27bbc088b188ba310ce253472f97cecb8363a2f27a1938155a856424b7'
compiledAt: '2026-08-28T01:22:10.862Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['user.ts']
---

## Summary

This fixture module demonstrates a layer-boundary violation: the domain layer (domain/user.ts) directly imports business logic from the services layer (services/validation), breaking the expected dependency direction. The module exports a createUser factory that constructs User domain objects but delegates validation to a service dependency, coupling domain code to a higher-level abstraction tier.

## Invariants

- Domain layer must NOT import from services layer; validation belongs in domain or is injected as a capability
- createUser is the entry point—removing it or changing its signature would make the violation undetectable
- The ../services/validation import is the concrete violation; an architecture enforcer should flag any path crossing layer N → layer N+1 (or deeper)
- validateUser call in createUser creates runtime coupling; tests that mock/remove this import would miss the architectural debt

## Interface Contract

```ts
export createUser
```

## Dependency Slice

```
import { validateUser } from '../services/validation'
```
