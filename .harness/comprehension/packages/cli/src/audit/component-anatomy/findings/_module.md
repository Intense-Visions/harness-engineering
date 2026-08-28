---
schemaVersion: 1
module: 'packages/cli/src/audit/component-anatomy/findings'
sourceHash: 'dd7836ab97801d9937fe8af46e0230b9806a67616907cfc037ea65ebff24c8a1'
compiledAt: '2026-08-28T01:22:08.718Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['finding.ts', 'severity.ts']
---

## Summary

This module defines the stable finding contract for component-anatomy audit across two key exports. `AnatomyFinding` is the shape emitted by the audit—it includes code, severity, file/line, componentType, message, evidence, rule, and fix. The code namespace is forward-declared across three families: `ANAT-D*` (definition findings), `ANAT-P*` (pattern-presence findings), and `ANAT-U*` (reserved for v2, pre-declared so verifier and orchestrator sub-projects wire on a durable contract). Severity resolution is two-stage: `defaultSeverityForCode()` maps each finding code to a default severity based on tier band (D000→info, D001–D029→error, D030–D099→warn, etc.), then `resolveSeverity()` applies the design's `strictness` setting (strict/standard/permissive) through a deterministic matrix that promotes warn→error under strict, demotes error→warn under permissive, and leaves info unchanged. This matrix mirrors harness-accessibility so both audits feel consistent downstream.

## Invariants

- Namespace is forward-compatible: ANAT-U\* pre-declared in type system even though v1 doesn't emit it, so sub-projects (#4 verifier, #5 orchestrator) can wire on stable code space without coupling to v1 implementation.
- Finding shape is locked: AnatomyFinding interface documented as stable across sub-projects; field renames or removals break downstream consumers without internal visibility.
- Severity monotonicity: info never promoted (always advisory); error softens only under permissive (one step down); warn moves bidirectionally. Keeps model deterministic and simple for adoption by other audits.
- Default severity is code-driven: each code's tier band (via regex on numeric suffix) determines default; rules may override their own default but defaultSeverityForCode() must be source of truth for unoverridden codes.
- Strictness defaults to 'standard': matches documented default in harness.config.json, ensuring unspecified projects behave predictably and consistently across audits.
- Matrix is intentionally minimal and table-driven: new audits should adopt the same matrix verbatim rather than invent their own, per ADR-0020, to keep cross-audit severity behavior predictable.

## Interface Contract

```ts
export defaultSeverityForCode
export resolveSeverity
```

## Dependency Slice

```
import { Severity } from './finding.js'
```
