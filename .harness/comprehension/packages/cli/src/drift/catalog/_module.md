---
schemaVersion: 1
module: 'packages/cli/src/drift/catalog'
sourceHash: '973b10432766ba34c32a0fb18ae4109a95519d3cd73b63aa478b251e9fd75e4d'
compiledAt: '2026-08-28T01:22:09.215Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

The `drift/catalog` module maintains a single source of truth for the built-in `DRIFT-*` finding codes emitted by the design-drift detector. It defines eight codes in two categories—token-bypass (T-series) for design-system palette violations, and primitive-adoption (P-series) for component usage drift—each paired with a standard severity and description. The module exports three query helpers: `getDriftCodes()` returns a sorted snapshot of all codes, `lookupDriftCode(code)` provides O(1) safe lookup (returning `null` for unknown codes), and `listDriftCodes()` yields a mutable copy of the full catalog. Both the internal `ENTRIES` array and the lookup map are immutable, ensuring callers cannot mutate the registry through returned references. The catalog exists to decouple code definition from severity computation, making code additions a single-entry change and enabling cross-skill consumers to access the code set without coupling to internal machinery.

## Invariants

- Single mutable source: ENTRIES is the only source of truth; the byCode lookup map is derived from it once and stays in sync because ENTRIES is frozen.
- Immutability contract: Object.freeze(ENTRIES) + readonly type annotations prevent accidental mutations; returned arrays/copies are fresh on each call so callers cannot mutate the registry through function returns.
- Forward-compatible lookup: lookupDriftCode() returns null for unknown codes, allowing older catalog consumers to tolerate codes from newer detectors without crashing.
- Code-to-category consistency: Each code's first character after DRIFT- (T or P) must match its declared category field; this discriminant enables downstream joins against emitted findings.
- Stable export surface: Consumers import via ../exports.ts, not directly; the shape of DriftCodeEntry is the durable contract.
- Severity mapping: Each code has exactly one standardSeverity under standard strictness mode; severity variation is computed elsewhere, not in the catalog.
- Finite enumeration: The catalog enumerates all v1 codes; new codes are added here first before being wired into rule emitters.

## Interface Contract

```ts
export getDriftCodes
export listDriftCodes
export lookupDriftCode
```

## Dependency Slice

```
import { DriftFindingCode, DriftSeverity } from '../findings/types.js'
```
