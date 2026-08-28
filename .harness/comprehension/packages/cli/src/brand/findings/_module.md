---
schemaVersion: 1
module: 'packages/cli/src/brand/findings'
sourceHash: '43c34eccd46a9c170f2d31e9c8f4ca4b7846745736c2df202eea37487e5d821e'
compiledAt: '2026-08-28T01:22:08.734Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['finding.ts']
---

## Summary

The `packages/cli/src/brand/findings` module defines the data model for brand compliance violations detected by `audit-brand-compliance`. It exports a `BrandFinding` interface representing a single violation (code, location, message, evidence, remediation) and `severityFor()`, which maps a finding code + design strictness level to one of three severity tiers: `error`, `warn`, or `info`.

Findings come in two flavors: **BRAND-T** codes flag forbidden token usage (e.g., using a design token in a context where it's prohibited), and **BRAND-V** codes flag voice violations (e.g., string literals containing forbidden phrases). The severity lookup respects three strictness modes: `strict` (all errors), `standard` (T001→error, V001→warn, everything else→warn by default), and `permissive` (all info).

## Invariants

- Severity is a pure function of (code, strictness). No mutable state; same input always yields same output. Callers rely on this for reproducible audit results.
- Standard mode has a hardcoded lookup table. T001 and V001 are special-cased; unknown codes default to 'warn'. Changing this table is a breaking change for audit consumers.
- Code format is strict. Must match the pattern BRAND-T${string} or BRAND-V${string}; the prefix disambiguates rule type.
- Line location can be null. Not all violations are locatable to a line (e.g., file-level or metadata violations); callers must handle this.
- Every finding carries evidence and remediation. The snippet and fix.description fields are required; they guide manual or codemod-based repairs.

## Interface Contract

```ts
export severityFor
```

## Dependency Slice

```

```
