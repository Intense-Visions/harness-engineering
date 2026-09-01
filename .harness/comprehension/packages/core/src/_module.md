---
schemaVersion: 1
module: 'packages/core/src'
sourceHash: 'faa01a022fa5e5a2f07b8bd4a33d5a66c67c6cc5008412d09a0be261fa1b6b0f'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'update-checker.ts', 'version.ts']
---

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
