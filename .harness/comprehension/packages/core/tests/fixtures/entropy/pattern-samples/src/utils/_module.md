---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/pattern-samples/src/utils'
sourceHash: '952946ef7774f5e06a5f3f87a58321d39946f362736f987badd61c3c4ed9d2cb'
compiledAt: '2026-08-28T01:22:10.859Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['helper.ts', 'too-many-exports.ts']
---

## Summary

This is an entropy test fixture demonstrating three intentional pattern violations used to validate drift detection: (1) naming inconsistency with `Helper_Function()` and `HELPER_VALUE` violating camelCase conventions; (2) missing JSDoc on `helper()` despite the require-jsdoc pattern; (3) over-export in `too-many-exports.ts` with 7 symbols exceeding the 5-export limit. The module is not production code but a test harness for pattern enforcement.

## Invariants

- All utils exports must use camelCase for functions and variables; SCREAMING_SNAKE_CASE and Snake_Case trigger violations
- Every exported function must have JSDoc documentation; bare exports fail the require-jsdoc pattern
- No file may export more than 5 symbols; the 7 exports (a–g) in too-many-exports.ts violate the export budget
- The nine-export interface contract is complete and intentional; all three violation types must be detectable by entropy and drift-detection tooling

## Interface Contract

```ts
export HELPER_VALUE
export Helper_Function
export a
export b
export c
export d
export e
export f
export g
export helper
```

## Dependency Slice

```

```
