---
schemaVersion: 1
module: 'packages/core/src'
sourceHash: '8abf216f74be859c7c8b43be18a85bb46ec7c529ae5b9b1236e3c45fc08182a1'
compiledAt: '2026-08-28T01:22:10.238Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'update-checker.ts', 'version.ts']
---

## Summary

**`@harness-engineering/core`** is the foundational library of the Harness Engineering toolkit—a 45+ module system providing standardized building blocks for codebase analysis, validation, workflow orchestration, and agent-driven development. It functions as a monolithic facade exported from a single entry point.

The module is organized into three layers:

1. **Foundations** — Error handling, language parsing (TypeScript AST), filesystem utilities, and project structure validation.

2. **Analysis & Detection** — Codebase structure analysis, drift detection, code review telemetry, performance baselines, per-module compiled comprehension units, and roadmap parsing.

3. **Orchestration & Execution** — Multi-step task execution, skill invocation pipelines, cross-run fleet work-claim leases, task DAG parallelization, lifecycle hooks, and deployment readiness.

Supporting layers cover observability (telemetry, adoption metrics, usage tracking, caching), integration (blueprint generation, agent interaction), and operational utilities (version checking, pricing lookup).

## Invariants

- Auto-generated barrel contract: index.ts is strictly auto-generated via `pnpm run generate:barrels`; hand-edits will be overwritten. Listed exports must exist; submodule changes require regeneration.
- Monolithic re-export facade: all toolkit features flow through @harness-engineering/core to maintain API stability and single version of truth; submodules must not be imported directly.
- Submodule independence: each domain module is self-contained with no circular dependencies; index files privately export from that domain only.
- Standardized error handling: all error types (BaseError, ValidationError, ConstraintError, etc.) and createError() factory flow through core for consistent error contracts.
- Filesystem state paths: modules store state in ~/.harness/\* with fixed JSON contracts; path schemes and structures are load-bearing for concurrent access.
- Language parser extensibility: LanguageParser type and TypeScriptParser implementation are the contract for AST analysis; new parsers must conform.
- Telemetry & metrics aggregation: adoption, usage, caching metrics, and tracing flow into telemetry-synthesis; five-surface composition is the canonical reporting layer.
- Comprehension unit hash provenance: compiled comprehension uses source-hash-bound units with IO-injected compiler; hash gate is load-bearing for correctness without API tokens.
- Fleet lease primitives: cross-run work-claim leases use per-leaf context-replay budget + server-clock TTL; spend-envelope decision primitive consulted by orchestrator loop and fleet-command dispatch.
- Task DAG & parallelization plan: planParallelization() builds task graph and wave-groups it; ParallelizationPlan contract (waves, dependencies, firing decisions) drives executor scheduling.

## Interface Contract

```ts
export *
export AST
export BaseError
export BlueprintGenerator
export BranchValidationResult
export BranchingConfig
export CacheMetricsRecorder
export CacheMetricsRecorderOptions
export ConstraintError
export ContextError
export DEFAULT_FIND_FILES_IGNORE
export DailyAdoption
export EntropyError
export Export
export FeedbackError
export FiringDecision
export HealthCheckResult
export Import
export LanguageParser
export OTLPExporter
export OTLPExporterOptions
export OwnershipConflict
export OwnershipOverlap
export ParallelizationPlan
export ParallelizationWave
export ParseError
export PlanParallelizationInput
export PlanTaskValidation
export ProjectScanner
export RetrospectiveCoverage
export RetrospectiveOptions
export RetrospectiveReport
export SkillRetroStat
export SpanAttributes
export SpanKind
export TraceSpan
export TypeScriptParser
export UpdateCheckState
export VERSION
export ValidationError
export WHATWG_BAD_PORTS
export WaveSeverity
export aggregateAdoptionByDay
export aggregateBySkill
export assertPortUsable
export buildTaskGraph
export collectEvents
export createError
export createParseError
export forecastOwnershipConflicts
export getCatalogRetrospectiveReport
export getOrCreateInstallId
export getUpdateNotification
export invalidateCheckState
export isAbandonedMidWorkflow
export isBadPort
export isUpdateCheckEnabled
export pathsOverlap
export planParallelization
export readAdoptionRecords
export readCheckState
export readIdentity
export renderRetrospectiveMarkdown
export resolveConsent
export send
export shouldRunCheck
export spawnBackgroundCheck
export topSkills
export validateBranchName
export validatePlanTasks
```

## Dependency Slice

```
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
```
