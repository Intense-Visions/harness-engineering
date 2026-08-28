---
schemaVersion: 1
module: 'packages/cli/src/align/findings'
sourceHash: 'f6a9a444bef1901402d32fe5a1ac1868b59f12524023f87194279456eaa88e2a'
compiledAt: '2026-08-28T01:22:08.682Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['outcome.ts']
---

## Summary

The `align/findings` module defines the output contract for the align-design-system drift-fixer. It models each drift finding as flowing through one of four processing outcomes (applied, suggestion, skipped, failed), tracking both individual fixes and aggregate run statistics.

The core abstraction is **FixOutcome**, a discriminated union keyed on `kind`. Each variant carries the original `DriftFinding` plus outcome-specific data: `applied` holds the before/after diff, `suggestion` holds rich text for human review, `skipped-unsafe` and `failed` hold reason strings. This ensures callers can render or persist each branch without null-checks.

The run output bundles outcomes into `AlignDesignSystemOutput`, which packages individual fixes alongside summary counts, a catalog of affected files, and metadata about the run mode (standalone/pipeline), dry-run flag, and revert state. The revert semantics are load-bearing: `revert: true` inverts the last applied batch (inverse diffs), reusing the same FixOutcome shape so rendering logic stays uniform.

## Invariants

- FixOutcome is a discriminated union keyed on `kind` — type narrowing is mandatory; callers branch on kind to access outcome-specific fields safely
- Every outcome carries its originating DriftFinding — the finding is the pivot; traceability from drift detection through fix outcome is non-negotiable
- AlignSummary counts are exhaustive over FixOutcome.kind — `applied + suggestions + skipped + failed = totalFindings`; allows rollup auditing
- Revert mode reuses FixOutcome shape — inverse-apply produces `applied` outcomes (not a new shape); rendering pipeline must not assume apply direction
- Files in AlignCatalog.codemodApplied/suggestionsEmitted correspond to outcomes — the catalog is an index for fast lookup; omission = no outcome of that kind
- tokensLoaded in AlignMeta gates LLM-assisted suggestions — false means suggestion outcomes should not have been generated; callers may need to reject them

## Interface Contract

```ts

```

## Dependency Slice

```
import { DriftFinding } from '../../drift/findings/finding.js'
```
