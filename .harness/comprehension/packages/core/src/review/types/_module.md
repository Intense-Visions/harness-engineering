---
schemaVersion: 1
module: 'packages/core/src/review/types'
sourceHash: 'a847f9551f5e69907c6e7e020a06854762b0020c547785a91f5f9164e26150e2'
compiledAt: '2026-08-28T01:22:10.506Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'context.ts',
    'fan-out.ts',
    'index.ts',
    'mechanical.ts',
    'meta-judge.ts',
    'output.ts',
    'parallel-groups.ts',
    'pipeline.ts',
  ]
---

## Summary

`packages/core/src/review/types` defines the data contract for a seven-phase code review pipeline. The module structures findings, context, and pipeline state across:

- **Phase 3 (Context Scoping)**: `ContextBundle`, `DiffInfo`, `ChangeType`, `ReviewStage` — scopes files and commit history per review domain (compliance, bug, security, architecture, learnings) with optional stage isolation.
- **Phase 4 (Fan-Out)**: `ReviewFinding`, `ReviewSubagent`, `ReviewConfidence` — common schema for findings produced by parallel agents, with numeric confidence anchors (25=speculative/suppress, 50=judgment, 75=concrete, 100=verifiable-from-diff) and subagent tracking (compliance, bug, security, architecture, learnings, plus conditionals: adversarial, typescript-strict, frontend-races).
- **Phase 5.75 (Finding Integrity)**: `FindingInvariant`, `FindingIntegrityViolation` — enforces two invariants on every finding: evidence-class-consistency (security findings must have evidence that substantiates their CWE/OWASP claim) and confidence-reconciliation (confidence label cannot exceed what the validation method supports).
- **Phase 7 (Output)**: `ReviewAssessment` (approve/comment/request-changes), `GitHubInlineComment`, `ReviewStrength` — formats findings for GitHub and terminal.
- **Pipeline Control**: `PipelineContext` (mutable state threaded through phases), `PipelineFlags` (CLI/MCP controls like --comment, --isolated, --thorough), `ReviewPipelineResult` (immutable result).
- **Supporting**: `MechanicalCheckResult` (lint/typecheck/security scan output), `ParallelGroups` (topological sort for concurrent dispatch), `Rubric` (pre-generated criteria to prevent after-the-fact rationalization in thorough mode).

## Invariants

- ReviewFinding.id is unique per domain/file/line — Format 'domain-file-line' (e.g., 'bug-src/auth.ts-42') used for deduplication.
- ContextBundle.stage isolation — When present, bundle belongs to exactly one stage (spec-compliance or code-quality) with context filtered accordingly; prevents spec context from biasing code-quality review.
- Evidence-class-consistency invariant — A finding claiming a vulnerability class (cweId, owaspCategory, or domain='security' at critical) must carry evidence that could plausibly substantiate that class.
- Confidence-reconciliation invariant — Finding's confidence label ≤ what its validatedBy method and trustScore can support (heuristic ≤ 50, graph ≤ 75, mechanical = 100).
- ReviewConfidence anchors are absolute — Numeric confidence (25|50|75|100) means specific verifiability levels; agents must suppress confidence=25 (speculative); legacy string confidence only in security domain.
- PipelineContext.skipped short-circuits — When skipped or stoppedByMechanical is true, phases 3-7 do not run; output reflects gate/mechanical result.
- MechanicalCheckResult.stopPipeline gating — True only if validate or check-deps failed; blocks all downstream phases. Warnings (docs, security) do not stop the pipeline.
- Rubric pre-generation prevents bias — In thorough mode, rubric generated BEFORE agents read implementation; agents use rubricItemId to tie findings back to pre-generated criteria.
- ParallelGroups.waves acyclicity — Topological grouping guarantees no cycles in input; cyclic and orphaned nodes recorded separately; waves[i] depends only on waves[0..i-1].
- DiffInfo.fileDiffs is comprehensive — All changedFiles, newFiles, and deletedFiles are keys in the fileDiffs Map; no missing entries.

## Interface Contract

```ts
export *
```

## Dependency Slice

```
import { ContextBundle, DiffInfo, GraphAdapter, ReviewDomain } from './context'
import { ReviewFinding } from './fan-out'
import { EvidenceCoverageReport, MechanicalCheckResult } from './mechanical'
import { Rubric } from './meta-judge'
import { GitHubInlineComment, PrMetadata, ReviewAssessment, ReviewStrength } from './output'
```
