---
schemaVersion: 1
module: 'packages/core/tests/fixtures/undocumented-project/src'
sourceHash: 'ac475328bcf283c362037ea2cb00addb08cecaf4d6007cf997de3a062794ae16'
compiledAt: '2026-08-28T01:22:10.863Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['also-undocumented.ts', 'documented.ts', 'undocumented.ts']
---

## Summary

`undocumented-project/src` is a test fixture module that exports three stub functions with intentionally varied documentation coverage. It's used to validate the documentation-detection logic: one function is marked as `documented`, while the other two (`undocumented` and `alsoUndocumented`) are intentionally undocumented to test coverage gaps. The module has no external dependencies and serves as a controlled test case for documentation auditing tools.

## Invariants

- Export names are test-critical: `documented`, `undocumented`, and `alsoUndocumented` must remain unchanged — test assertions key off these exact identifiers to verify coverage detection works correctly
- Stub bodies are correct: Functions are empty (`{}`) by design; this is fixture code, not real implementation
- No cross-module dependencies: The module stands alone with no imports, keeping test scenarios isolated and predictable

## Interface Contract

```ts
export alsoUndocumented
export documented
export undocumented
```

## Dependency Slice

```

```
