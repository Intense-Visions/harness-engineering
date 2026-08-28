---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/polyglot-ts-py/src'
sourceHash: '8f63383acf9b17e469bb523467dcfb0a74a2aee93fe8541128f80d37cfd0481b'
compiledAt: '2026-08-28T01:22:10.860Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

A minimal TypeScript test fixture exporting a single string constant. Part of a polyglot (TS/PY) entropy test suite, likely used to validate entropy detection or dead-code analysis across mixed-language codebases. The module has no dependencies and serves as a controlled test subject—its only responsibility is the `greeting` export.

## Invariants

- Export contract: Must export `greeting` as a named export (not default) for downstream test consumers to find it
- Literal value: The string value `'hello'` is part of the test's assertion surface—renaming or changing it breaks test fidelity
- No imports: Kept deliberately dependency-free to isolate entropy signals in the test (any new imports would pollute the fixture)
- Polyglot co-location: Lives alongside a Python equivalent in the same fixture directory—structural parity matters for cross-language test coverage

## Interface Contract

```ts
export greeting
```

## Dependency Slice

```

```
