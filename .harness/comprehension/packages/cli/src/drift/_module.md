---
schemaVersion: 1
module: 'packages/cli/src/drift'
sourceHash: '83a2a677695eb308b7421687601e0113a1ee3c4b5e1c90eb0f2341141a0d517d'
compiledAt: '2026-08-28T01:22:09.217Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['exports.ts', 'index.ts']
---

## Summary

`packages/cli/src/drift` implements design-drift detection as a verifier step in the design-pipeline, scanning source files for two classes of violations: token bypass (DRIFT-T*) when `tokens.json` exists, and primitive adoption (DRIFT-P*) when `DESIGN.md` declares a Component Registry. It follows the verifier-shape pattern (same as audit-anatomy and design-craft) for orchestrator composability. Rules are conditionally enabled based on both configuration and resource availability—token bypass runs only if tokens.json loads; primitive adoption runs only if the registry loads from DESIGN.md. Scanning respects project-wide and design-specific exclude patterns (minimatch), with explicit file lists bypassing excludes entirely. File collection uses bounded-depth tree walk (depth ≤ 8, skipping heavy dirs) for performance. Findings aggregate by severity and code for summary reporting.

## Invariants

- Rule enablement is conjunctive: a rule runs only if both its configuration flag is true AND its required resource (tokens file or registry) successfully loads; missing resources silently disable that rule without error
- Exclude patterns are layered as design.exclude ∪ analysis.exclude; when explicit file list is passed, both are ignored (explicit paths are deliberate scoping)
- Paths normalized to POSIX for exclude matching: project-relative paths use forward slashes, enabling cross-platform glob consistency with matchBase semantics
- Verifier output shape is stable: findings + summary + catalog + meta mirrors audit-anatomy and design-craft for orchestrator pattern-matching; catalog.rulesApplied records which rules actually ran
- File collection is gated: walk only collects TypeScript/JavaScript/CSS files; walk bounded to depth 8; read failures silently produce empty finding lists, not errors

## Interface Contract

```ts
export DriftFinding
export DriftFindingCode
export DriftSeverity
export DriftStrictness
export runDetectDrift
```

## Dependency Slice

```
import { loadAnalysisExclude, loadDesignExclude } from '../config/analysis-schema.js'
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { Verifier } from '../shared/verifier.js'
import { DriftFinding, DriftSeverity, DriftStrictness } from './findings/finding.js'
import { loadComponentRegistry } from './resolvers/component-registry.js'
import { loadTokenSet } from './resolvers/tokens.js'
import { runPrimitiveAdoptionRule } from './rules/primitive-adoption-rule.js'
import { runTokenBypassRule } from './rules/token-bypass-rule.js'
import { minimatch } from 'minimatch'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
