---
schemaVersion: 1
module: 'packages/cli/src/naming-craft/findings'
sourceHash: 'eb16a980bade515e75d11998e6d2f064697b20f9f8bdaa506551e161b0e0f2af'
compiledAt: '2026-08-28T01:22:09.297Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['derived.ts', 'schema.ts']
---

## Summary

The `naming-craft/findings` module defines the output contract for naming-craft's critique phase. It exports a unified finding type (`NamingFinding`) that surfaces naming convention violations across identifiers (variables, functions, types, files). The module reuses the three-axis finding model from the broader craft family (Tier/Impact/Confidence) to keep cross-craft consumers uniform and avoid type-narrowing. Findings anchor to stable code-space references (NAME-R\d{3} codes) and include a derived priority computed by shared logic. A companion summary type tracks run metadata—including file reach and prompt coverage—so consumers know whether critique was full or partial.

## Invariants

- Axis Reuse: Tier, Impact, Confidence are imported from shared axes (../../shared/craft/findings/axes.js), not redefined; cross-craft consumers can introspect findings without per-skill type guards
- Stable Codes: NamingFinding.code lives in the NAME-R\d{3} namespace; future code-shifts must not renumber existing codes
- Phase Lock (v1): NamingFinding.phase is always 'critique'; no POLISH phase exists yet; output schemas must enforce this until v2 splits them
- Convention Mapping: ProjectConvention maps each identifier kind (variable, function, type, file) to its expected convention; null indicates no convention set, not any-convention-allowed
- Coverage Transparency: When NamingCraftSummary.coverage is present, promptsAnswered ≤ promptsTotal; partial critique must surface this so callers don't misread silence as approval
- filesScanned Semantics: Zero files scanned means nothing analyzable found (e.g., non-TS/JS project), not clean-bill-of-health; must be surfaced in diagnostics
- Derived Priority Centralization: derivePriority is re-exported from shared logic, not reimplemented; keeps priority semantics consistent across naming-craft, design-craft, and future craft skills
- Rubric Traceability: cite.rubricId + cite.source form an immutable audit trail back to the critique rubric; both are required

## Interface Contract

```ts
export Confidence
export Impact
export Tier
export derivePriority
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
```
