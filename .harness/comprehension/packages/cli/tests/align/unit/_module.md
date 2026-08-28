---
schemaVersion: 1
module: 'packages/cli/tests/align/unit'
sourceHash: '290239e2c4bd201020e4bac168fe99b66e40e0b4ca23905a372273ccb665e6e9'
compiledAt: '2026-08-28T01:22:09.527Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['catalog.test.ts']
---

## Summary

This unit test suite pins the **align-design-system catalog contract** — a registry of DRIFT-\* codes that align v1 ships fixes for, along with their handling strategy (codemod-or-suggestion vs suggestion-only). The tests are mirrors of drift/catalog tests and exist to lock in predictable behavior for orchestrator and cross-skill consumers.

The catalog declares exactly 8 codes: `DRIFT-P001-P004` (pattern-category, all suggestion-only) and `DRIFT-T001-T004` (transformation-category, three codemod-capable, one suggestion-only). The suite verifies registry shape, handling classification, codemod subset isolation, metadata completeness, drift parity coverage, and export contract fidelity.

## Invariants

- Immutable-per-call: getAlignCodes() returns a fresh array copy each time; caller mutations don't affect the registry.
- Exact code set: Catalog contains exactly 8 codes (P001–P004, T001–T004) in sorted order.
- Handling split: T001/T002/T003 are 'codemod-or-suggestion'; T004 and all P\* codes are 'suggestion-only'.
- Codemod subset: getCodemodCapableCodes() returns exactly [T001, T002, T003]; no others.
- Drift parity: Align catalog must cover every code the drift detector ships; new drift codes force catalog updates.
- Export fidelity: Public exports must byte-match internal catalog; misalignment breaks downstream consumers.
- Metadata density: All catalog entries must have non-empty descriptions (no placeholder entries).
- Forward-compat on lookups: Unknown codes (e.g., DRIFT-V001) return null, not throw; allows graceful degradation when spec adds new code families.

## Interface Contract

```ts

```

## Dependency Slice

```
import { getAlignCodes, getCodemodCapableCodes, listAlignCodes, lookupAlignCode } from '../../../src/align/catalog/index.js'
import { getAlignCodesPublic, getCodemodCapableCodesPublic, lookupAlignCodePublic } from '../../../src/align/exports.js'
import { getDriftCodes } from '../../../src/drift/catalog/index.js'
import { describe, expect, it } from 'vitest'
```
