---
schemaVersion: 1
module: 'packages/core/src/entropy/types'
sourceHash: '984ba601340944924efa0f24653c8a379321d44761887a05ae08961f22465118'
compiledAt: '2026-08-28T01:22:10.392Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'complexity.ts',
    'config.ts',
    'coupling.ts',
    'dead-code.ts',
    'drift.ts',
    'fix.ts',
    'index.ts',
    'pattern-config.ts',
    'pattern.ts',
    'report.ts',
    'size-budget.ts',
    'snapshot.ts',
  ]
---

## Summary

This module is a comprehensive types barrel for entropy detection and analysis. It exports type definitions for measuring and remediating code decay across six dimensions: dead code, documentation drift, complexity, coupling, architectural patterns, and size budgets. The module coordinates findings with remediation guidance—each finding type (DeadExport, DocumentationDrift, ComplexityViolation, etc.) pairs with corresponding fix operations and suggestions. Configuration is composable: entropy analyses can be selectively enabled and customized with thresholds, ignoring rules, and protected regions (code annotated as intentional, exempt from cleanup). Core flows: (1) detect entropy via snapshot + config → scan → report, (2) filter by safety/hotspot → CleanupFinding, (3) suggest remediation → Suggestion (fix type + manual steps), (4) apply fixes → FixResult (with dry-run + backup). Dead code detection treats public APIs specially—zero importers don't imply deletion, but wiring or deprecation.

## Invariants

- DeadExport.reason semantics: NO_IMPORTERS (safe to delete) vs. PUBLIC_API_UNUSED (advisory only—breaking change to delete; wire or deprecate instead). Suppressible via @public annotation or DeadCodeConfig.publicApiAllowlist.
- DeadFile.reason routes remediation: UNREFERENCED_ENTRY_POINT must NOT be deleted; declare in entropy.entryPoints instead (issue #1325). Only NO_IMPORTERS files are candidates for deletion.
- Fix.safe is invariant true: safety filtering is orthogonal, at CleanupFinding level via SafetyLevel enum (safe / probably-safe / unsafe / protected). Fixes in protected regions are skipped, not applied.
- forwardLookingPaths suppress drift in prospective docs: refs in docs/architecture/, docs/adr/, docs/proposals/, etc. are exempt from API-signature drift checks (issue #492).
- protectedRegions gate both findings and fixes: dead-code findings within protected regions are excluded from reports; fixes targeting protected lines are skipped (dual-gate, config-driven).
- ComplexityViolation.tier ∈ {1, 2, 3}: tier indicates severity of code complexity; severity field (error / warning / info) maps independently from tier.
- Suggestion type configure-entrypoint: reserved for non-destructive remediation of UNREFERENCED_ENTRY_POINT—the only suggestion type NOT implying file/code deletion.

## Interface Contract

```ts
export *
export EntropyError
```

## Dependency Slice

```
import { ProtectedRegionMap } from '../../annotations'
import { DependencyGraph } from '../../constraints/types'
import { EntropyError } from '../../shared/errors'
import { AST, Export, Import, LanguageParser } from '../../shared/parsers'
import { ComplexityConfig, ComplexityReport } from './complexity'
import { EntropyConfig } from './config'
import { CouplingConfig, CouplingReport } from './coupling'
import { DeadCodeReport } from './dead-code'
import { DriftReport } from './drift'
import { PatternReport } from './pattern'
import { PatternConfig, PatternMatch } from './pattern-config'
import { SizeBudgetConfig, SizeBudgetReport } from './size-budget'
import { CodebaseSnapshot, SourceFile } from './snapshot'
```
