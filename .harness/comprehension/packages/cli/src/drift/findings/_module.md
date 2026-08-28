---
schemaVersion: 1
module: 'packages/cli/src/drift/findings'
sourceHash: '30d1ac56099b90bb9edb5a4f795a620bc0519dbf19f1b08df95eeacf242e04da'
compiledAt: '2026-08-28T01:22:09.218Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['finding.ts', 'types.ts']
---

## Summary

The `packages/cli/src/drift/findings` module defines the contract for design-drift findings emitted by the detect-design-drift pipeline stage. It wraps token-bypass violations (hardcoded values where design tokens exist) and primitive-adoption violations (raw HTML where components are registered). Split into `types.ts` (import-free type definitions) and `finding.ts` (public surface with `DriftFinding` interface and `severityFor()` function). The `severityFor(code, strictness)` function consults the code catalog to return correct severity based on project strictness: strict→all error, standard→tabulated per-code from catalog, permissive→all info.

## Invariants

- Type cycle prevention: types.ts must remain import-free so the catalog can reference DriftFindingCode without importing from finding.ts (which imports lookupDriftCode from catalog)
- Single source of truth for standard severities: the catalog's standardSeverity table is authoritative; severityFor() reads from it on every call to prevent drift between inline table and public catalog
- Strictness model is deterministic: permissive and strict modes override all codes; standard mode delegates to catalog entry for each code
- Finding codes are template-enforced: DRIFT-T${string} for token bypass, DRIFT-P${string} for primitive adoption
- Evidence and fix guidance are mandatory: every finding must include code snippet + context and actionable fix metadata (kind + description)

## Interface Contract

```ts
export DriftFindingCode
export DriftSeverity
export DriftStrictness
export severityFor
```

## Dependency Slice

```
import { lookupDriftCode } from '../catalog/index.js'
import { DriftFindingCode, DriftSeverity, DriftStrictness } from './types.js'
```
