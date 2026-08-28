---
schemaVersion: 1
module: 'packages/cli/tests/drift/catalog'
sourceHash: '986c8e0e8c6516ca7047f01f7d207045b50d847bd7381fea94ab837864d9e984'
compiledAt: '2026-08-28T01:22:09.695Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.test.ts']
---

## Summary

This test suite validates the drift finding-code catalog — a registry that defines all DRIFT-\* error codes emitted by detect-design-drift v1. The catalog is the single source of truth for downstream consumers like the orchestrator and align introspection skill. Tests verify the registry shape, lookup behavior, metadata completeness, and that public re-exports stay synchronized with the internal module.

## Invariants

- Fixed v1 code set: getDriftCodes() returns exactly 8 codes (DRIFT-P001/002/003/004 and DRIFT-T001/002/003/004) in sorted order — the enumeration is locked.
- Registry isolation: getDriftCodes() returns a fresh copy on each call; caller mutations don't bleed back into the registry.
- Safe unknown-code lookup: lookupDriftCode(unknown) returns null (never throws) for unknown codes, enabling forward-compatibility when new codes ship.
- Metadata completeness: Every catalog entry must have a non-empty description; every code has a category and standardSeverity field.
- Category enumeration: Categories are strictly 'token-bypass' or 'primitive-adoption' — no other values.
- Severity-function consistency: severityFor(code, 'standard') output must match the catalog's standardSeverity field; these are locked together and cannot drift.
- Public export parity: Public re-exports (via drift/exports.js) return identical results to the internal module (drift/catalog/index.js); if they diverge, consumers see contradictory data.

## Interface Contract

```ts

```

## Dependency Slice

```
import { getDriftCodes, listDriftCodes, lookupDriftCode } from '../../../src/drift/catalog/index.js'
import { getDriftCodesPublic, lookupDriftCodePublic } from '../../../src/drift/exports.js'
import { severityFor } from '../../../src/drift/findings/finding.js'
import { describe, expect, it } from 'vitest'
```
