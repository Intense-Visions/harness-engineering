---
schemaVersion: 1
module: 'packages/cli/src/audit/component-anatomy'
sourceHash: '22ed982751d89b72334f12f9f30e5b5173eb0a5c65802fe4b096f0f2a30dcff5'
compiledAt: '2026-08-28T01:22:08.714Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['exports.ts']
---

## Summary

**audit-component-anatomy** is a design-system auditor that validates React component definitions against anatomy conventions (required slots, states, variants, sizes). It emits structured `ANAT-D*` findings for definition omissions and `ANAT-P*` findings for usage-site patterns. The module exposes a stable contract—`AnatomyFinding`, `AnatomyFindingCode`, `Severity` types and `getCatalogTypes()` function—consumed by **harness-accessibility** to defer overlapping A11Y-010/A11Y-050 checks. Findings are severity-adjusted by project `design.strictness` (strict/standard/permissive) via a deterministic matrix. Component types are resolved through a three-layer stack (JSDoc `@component-type` tag → DESIGN.md registry → export-name catalog match), returning `null` (silent skip) when unrecognized. The module supports Phase 1 Button vertical slice and Phase 2 catalog expansion (7 component types: Button, Checkbox, Dialog, EmptyState, Input, Select, Switch).

## Invariants

- Finding codes are authoritative: the namespace is pre-declared (D*/P*/U\*) and immutable. The runner does NOT emit codes lacking explicit mappings—required parts without mapped codes are skipped rather than fabricating synthetic codes. This keeps the namespace trustworthy for downstream consumers.
- getCatalogTypes() is the single source of truth: it returns a fresh sorted array of auditable component types. harness-accessibility depends on this to decide which JSX elements to defer A11Y findings for—it must remain current as Phase 2 catalog expands.
- Severity resolution is table-driven and deterministic: the design.strictness × defaultSeverityForCode matrix is shared with harness-accessibility for consistency across audits. Strictness always defaults to 'standard'; info findings are never promoted, errors only soften under permissive.
- Component type resolution uses a 3-layer stack with silent fallthrough: Layer 1 (JSDoc) > Layer 2 (DESIGN.md) > Layer 3 (export name). Per Decision #3, the resolver deliberately does NOT guess—unmatched files return null silently.
- The exported surface (exports.ts) is the stable contract: only getCatalogTypes, AnatomyFinding, AnatomyFindingCode, and Severity are guaranteed stable across releases. All other modules are internal and subject to change.
- Convention catalog is immutable at module boundary: getCatalogTypes(), listConventions(), and lookupConvention() return fresh copies to prevent external mutation. The internal builtinConventions array is the single source of truth.
- Finding shape is locked for sub-projects #4 & #5: the AnatomyFinding interface includes code, severity, file, line, column, componentType, message, evidence, rule, and fix—verifier and orchestrator wire on this schema without further coupling.

## Interface Contract

```ts
export AnatomyFinding
export AnatomyFindingCode
export Severity
export getCatalogTypes
```

## Dependency Slice

```

```
