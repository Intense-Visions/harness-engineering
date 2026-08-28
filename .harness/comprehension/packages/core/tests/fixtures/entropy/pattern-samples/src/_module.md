---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/pattern-samples/src'
sourceHash: '5eec35359a8d58fc8ec7e9fa88f6beaa1f19677d5be8d0497f0b15e77dd3faaa'
compiledAt: '2026-08-28T01:22:10.859Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

This is a test fixture for pattern violation detection and entropy analysis. It demonstrates both compliant and non-compliant code patterns, exposing only `UserService` and `helper` through the public barrel while intentionally including violations in non-exported modules to test linting and analysis rules. The fixture models code quality issues: improper export patterns, naming inconsistencies, excessive exports per file, and missing documentation.

## Invariants

- Public contract is immutable: only UserService and helper may be exported from index.ts
- Services must use dual-export pattern (default class + named export); bad-service.ts violates this intentionally
- Helper exports violate naming conventions: PascalCase_underscore (Helper_Function), SCREAMING_SNAKE_CASE (HELPER_VALUE), camelCase (helper) mixed in same file
- Export count limit: too-many-exports.ts deliberately exceeds max of 5 exports (has 7)
- Documentation requirement: helper() function lacks JSDoc, violating require-jsdoc pattern
- Non-exported violation files (bad-service.ts, too-many-exports.ts) must remain unexported to preserve fixture integrity

## Interface Contract

```ts
export UserService
export helper
```

## Dependency Slice

```

```
