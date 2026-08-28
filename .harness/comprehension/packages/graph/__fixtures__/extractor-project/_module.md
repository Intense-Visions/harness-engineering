---
schemaVersion: 1
module: 'packages/graph/__fixtures__/extractor-project'
sourceHash: 'b08c56aecfdeaf0ce21087034cc0feb81556fc6d2e326644867bdc45babda336'
compiledAt: '2026-08-28T01:22:11.568Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'AuthTest.java',
    'Enums.java',
    'Routes.java',
    'RoutesMethodMapping.java',
    'Validators.java',
    'auth.test.ts',
    'auth_test.go',
    'auth_test.py',
    'auth_test.rs',
    'enums.go',
    'enums.py',
    'enums.rs',
    'enums.ts',
    'routes.go',
    'routes.py',
    'routes.rs',
    'routes.ts',
    'validators.go',
    'validators.py',
    'validators.rs',
    'validators.ts',
  ]
---

## Summary

packages/graph/**fixtures**/extractor-project is a polyglot fixture that validates graph extraction across Java, TypeScript, Go, Python, and Rust. It models a unified e-commerce domain (users, orders, payments, auth) with HTTP routes, domain validators, enums, and test suites in each language. The fixture exercises extraction of routes, validators, enums, and tests—ensuring the graph extractor recognizes cross-language semantic equivalence where the same business concepts appear identically despite language syntax differences.

## Invariants

- Single semantic model across 5 languages: User, Order, Address, PaymentMethod, OrderStatus, Priority must be recognized as the same entities despite language syntax differences
- Route path consistency: /api/users, /api/orders, /api/orders/:id repeat across Express, Spring, Gin, FastAPI, Actix and must unify to a single canonical route graph
- Validator semantic matching: @Email/@Size (Java), Zod schema (TS), struct tags (Go), Pydantic (Python), validator macros (Rust) must consolidate to one validation schema per model
- Test naming alignment: Auth tests (rejectExpiredTokens, acceptValidJwt, lockAfterFailedAttempts) repeat across Vitest, JUnit, Go, pytest—test names are the cross-language extraction fidelity probe
- PaymentMethod enum encoding: Exported as Zod schema plus object-const pattern ('as const')—graph must handle both strict enum and object-const forms equivalently

## Interface Contract

```ts
export AddressSchema
export OrderSchema
export PaymentMethod
export UserSchema
export default
```

## Dependency Slice

```
import { Router } from 'express'
import { describe, expect, it, test } from 'vitest'
import { z } from 'zod'
```
