---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/dead-code-samples/src'
sourceHash: '051b015b7f941aefea6c2439a35b2858f3f9ad6fc8af5a5f2a92ce40bd1f52bf'
compiledAt: '2026-08-28T01:22:10.858Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['helper.ts', 'index.ts', 'unused.ts', 'used.ts', 'with-unused-import.ts']
---

## Summary

This is a dead-code detection test fixture demonstrating common patterns of unreachable and unused code. It exports only `usedFunction` and `wrapper` from `index.ts`, but internally contains multiple dead/unused symbols across three modules. `usedFunction` has a clean reachability chain (`usedFunction` → `helper()`), while `with-unused-import.ts` imports `anotherHelper` but never calls it, and `unused.ts` is an entire orphaned module unreachable from the entry point.

## Invariants

- Entry-point exports match contract: index.ts must export exactly usedFunction and wrapper; no re-export of unused symbols
- Reachability asymmetry: usedFunction must have a complete call chain (helper() is called), while wrapper() imports anotherHelper but does not use it
- Orphaned module: unused.ts has zero importers, making both unusedFunction() and anotherUnused() dead code
- Exported-but-unused symbol: unusedHelper() in helper.ts is exported but never imported anywhere (tests export visibility vs. actual use)
- Import-but-unused symbol: anotherHelper is in the dependency slice but unused in with-unused-import.ts (tests unused import detection)
- Dual dead-code types: Fixture covers both module-level dead code (unused.ts) and symbol-level dead code (unusedHelper, anotherHelper) to validate layered detection

## Interface Contract

```ts
export usedFunction
export wrapper
```

## Dependency Slice

```
import { anotherHelper, helper } from './helper'
```
