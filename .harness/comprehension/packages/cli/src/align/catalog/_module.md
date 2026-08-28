---
schemaVersion: 1
module: 'packages/cli/src/align/catalog'
sourceHash: '61ed22e6701f9559c17febe7e13c060d49bc37f7a329a488170f52c8c4f30af1'
compiledAt: '2026-08-28T01:22:08.646Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

`packages/cli/src/align/catalog` is a declarative registry that maps design-drift codes (DRIFT-T* and DRIFT-P*) to their handling modes in the align-design-system v1 skill. It centralizes routing logic so orchestrators and integration tests can introspect which codes support automatic codemods vs. suggestion-only without executing the skill. DRIFT-T001/T002/T003 support codemods-or-suggestions (classifier decides safety at runtime); DRIFT-T004 and DRIFT-P001–P004 are suggestion-only. The module follows the same pattern as `drift/catalog` and `audit/component-anatomy/catalog`, making v1.x additions a registry entry rather than a logic refactor.

## Invariants

- ENTRIES is frozen and all returned arrays are fresh copies—callers cannot mutate the single source of truth.
- Every code in ENTRIES must be a valid DriftFindingCode type; invalid codes break the type contract.
- Every code has exactly one handling mode ('codemod-or-suggestion' or 'suggestion-only'); the set is exhaustive.
- lookupAlignCode returns null for unknown codes, forcing explicit null checks; silent fallthrough violates caller contracts.
- getCodemodCapableCodes filters by mode, not existence—new 'suggestion-only' codes won't accidentally become auto-fixable.
- The catalog is the orchestrator's source of truth for routing; stale registry vs. actual skill implementation causes misrouting.

## Interface Contract

```ts
export getAlignCodes
export getCodemodCapableCodes
export listAlignCodes
export lookupAlignCode
```

## Dependency Slice

```
import { DriftFindingCode } from '../../drift/findings/finding.js'
```
