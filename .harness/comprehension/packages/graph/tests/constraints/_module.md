---
schemaVersion: 1
module: 'packages/graph/tests/constraints'
sourceHash: 'd581f3ae6b5a1dd109f308ce69c9ad7255621e373162865552bb986d62ba8b5c'
compiledAt: '2026-08-28T01:22:11.698Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['DesignConstraintAdapter.test.ts', 'GraphConstraintAdapter.test.ts']
---

## Summary

This test module validates two constraint-checking adapters that enforce design and architectural rules in the knowledge graph. DesignConstraintAdapter detects design-system violations (hardcoded colors/fonts, anatomy gaps, craft issues) and records them as graph constraints. GraphConstraintAdapter enforces architectural layer boundaries and dependency rules. Both adapters store violations as design_constraint nodes and violates_design edges in the GraphStore, making violations queryable and traceable across runs. Key capabilities: checkForHardcodedColors/Fonts detect values not in token sets (exact matches pass silently); checkAll combines checks; recordFindings persists violations as idempotent graph nodes, batching by code prefix (ANAT-_, CRAFT-_, DESIGN-_, A11Y-_) with human-readable labels; severity maps strictness (permissive→info, standard→warn, strict→error). GraphConstraintAdapter validates layer-based architecture (e.g., api→domain→shared), routes files via patterns, detects forbidden cross-layer deps and cycles.

## Invariants

- Token-exact matching silences hardcoded detection — colors/fonts are flagged only if absent from the token set; exact-match usage is silent
- Severity is strictness-driven — constraint severity follows strictness parameter directly with 'standard' as default; no additional scoring
- Idempotent constraint recording — re-recording identical findings (same code, file, line, message) produces zero new nodes/edges
- Code-prefix labeling is deterministic — known prefixes (ANAT-D/P/U, CRAFT-C/P/B, DESIGN-_, A11Y-_) map to fixed labels; unknown prefixes fall back to 'Design constraint'
- Edge metadata is sparse — violates_design edges only store fields provided; line, evidence, runId are optional and omitted when absent
- Constraint nodes deduplicate by code — multiple violations of the same code create one design_constraint node; file-specific violations are tracked as separate edges
- Layer rules are pattern-based — files match layers via glob patterns; allowed dependencies are explicitly listed per layer; any other dependency is a violation

## Interface Contract

```ts

```

## Dependency Slice

```
import { DesignConstraintAdapter, DesignViolation } from '../../src/constraints/DesignConstraintAdapter.js'
import { GraphConstraintAdapter, GraphDependencyData, GraphLayerViolation } from '../../src/constraints/GraphConstraintAdapter.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import { beforeEach, describe, expect, it } from 'vitest'
```
