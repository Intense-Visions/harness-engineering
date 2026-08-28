---
schemaVersion: 1
module: 'packages/core/src/ci'
sourceHash: '4dd8c94ce16f08b3e6c5d316facf366e9c1ab0842db282c1f0aa3344df0fb312'
compiledAt: '2026-08-28T01:22:10.290Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['base-freshness.ts', 'check-orchestrator.ts', 'index.ts', 'notifier.ts', 'report-formatter.ts']
---

## Summary

The `packages/core/src/ci` module is a CI check orchestrator that runs 9 quality gates (validate, deps, docs, entropy, security, perf, phase-gate, arch, traceability) with baseline-relative scoring and constraint-pack security overlays. It solves a critical merge-safety problem: GitHub's default CI settings allow stale green PRs to merge. A green CI conclusion is evidence only about the (commit, base) it ran against; if main has advanced since the test and strict branch protection is disabled, the green is outdated and must be downgraded to "degraded" until re-run. The orchestrator runs validate first, then the remaining checks in parallel. It resolves constraint packs (security rule overlays) that force-enable the security scanner with blast-radius control, scores violations baseline-relative (only NEW violations block), and computes per-pack compliance verdicts.

## Invariants

- Green CI ≠ merge-safe on current main—stale base without strict protection downgrades to degraded
- Constraint pack precedence cascades: user security.rules > pack overlay > force-enable base silence; project always wins
- Force-enable blast radius: silence all default rules (SEC-\*: off) before pack re-elevation to prevent unrelated rules from becoming blocking
- Baseline-relative violations: arch diffs filter through allowances; only NEW violations block, pre-existing ones don't regress
- Phase-gate cannot run at core level; check reports warning and directs to CLI harness check-phase-gate
- Execution order: validate runs first (gates later checks), remaining eight checks run in parallel
- Skipped checks return status='skip' with zero duration and empty issues; don't affect summary counts
- Pack compliance attribution: a pack's stage is compliant/non-compliant only based on rules IT governs; unrelated or uncovered findings are invisible to it
- No-baseline fallback: when arch has no baseline, all violations report per severity config without allowancing (most conservative)
- Exit code logic: fail>0→1, else (failOn='warning' and warnings>0)→1, else 0

## Interface Contract

```ts
export BaseFreshnessInput
export BaseFreshnessTrust
export BaseFreshnessVerdict
export CINotifier
export RunCIChecksInput
export classifyBaseFreshness
export formatCIReportAsMarkdown
export runCIChecks
```

## Dependency Slice

```
import { ArchConfigSchema, runArchCollectors } from '../architecture'
import { ArchBaselineManager } from '../architecture/baseline-manager'
import { filterDiffByAllowances, loadArchAllowances, resolveArchBaseline } from '../architecture/baseline-resolver'
import { diff } from '../architecture/diff'
import { defineLayer, validateDependencies } from '../constraints/dependencies'
import { ResolvedConstraintPacks, resolveConstraintPacks } from '../constraints/packs'
import { validateAgentsMap } from '../context/agents-map'
import { checkDocCoverage } from '../context/doc-coverage'
import { EntropyAnalyzer } from '../entropy/analyzer'
import { DriftConfig } from '../entropy/types'
import { TrackerSyncAdapter } from '../roadmap/tracker-sync'
import { parseSecurityConfig } from '../security/config'
import { SECURITY_SCAN_GLOB } from '../security/scan-targets'
import { SecurityScanner } from '../security/scanner'
import { TypeScriptParser } from '../shared/parsers'
import { Err, Ok, Result } from '../shared/result'
import { formatCIReportAsMarkdown } from './report-formatter'
import { GraphStore, queryTraceability, resolveGraphDir, skipDirGlobs } from '@harness-engineering/graph'
import { CICheckIssue, CICheckName, CICheckReport, CICheckResult, CICheckSummary, CIFailOnSeverity, CINotifyOptions, ConstraintPackCompliance, ConstraintPackComplianceStatus, ConstraintStage } from '@harness-engineering/types'
import from 'glob'
import * as path from 'node:path'
```
