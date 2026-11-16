---
schemaVersion: 1
module: 'packages/core/src/ci'
sourceHash: 'f28bac433ad046e36935cc962b9bef14061e0677810357fb8c80acf2ef1239a5'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'base-freshness.ts',
    'check-orchestrator.ts',
    'flake-attribution.ts',
    'index.ts',
    'notifier.ts',
    'report-formatter.ts',
    'verdict-cache.ts',
  ]
---

## Interface Contract

```ts
export AttributionInput
export AttributionResult
export BaseFreshnessInput
export BaseFreshnessTrust
export BaseFreshnessVerdict
export CINotifier
export CorrelatedRun
export DEFAULT_VERDICT_CACHE_DIR
export FailingTest
export FlakeVerdict
export GATE_VERSIONS
export MEMOIZABLE_CHECKS
export MIN_INDEPENDENT_FAILURES_FLOOR
export RunCIChecksInput
export RunObservation
export RunOrigin
export TestAttribution
export VerdictCache
export VerdictCacheConfig
export VerdictCacheStatsCollector
export attributeFailure
export classifyBaseFreshness
export cleanLogLine
export computeConfigHash
export computeProjectInputHash
export computeVerdictKey
export formatCIReportAsMarkdown
export matchDiff
export pairedSourceCandidates
export parseFailingTests
export parseVerdictCacheConfig
export runCIChecks
export shouldCacheResult
export testKey
```

## Dependency Slice

```
import { ArchConfigSchema, readDependencyRules, runArchCollectors, withDependencyRules } from '../architecture'
import { ArchBaselineManager } from '../architecture/baseline-manager'
import { filterDiffByAllowances, loadArchAllowances, resolveArchBaseline } from '../architecture/baseline-resolver'
import { diff } from '../architecture/diff'
import { computeSourceHash } from '../comprehension/source-hash'
import { validateDependencies } from '../constraints/dependencies'
import { resolveDepsSettings, toLayerConfig } from '../constraints/layer-config'
import { ResolvedConstraintPacks, resolveConstraintPacks } from '../constraints/packs'
import { validateAgentsMap } from '../context/agents-map'
import { checkDocCoverage } from '../context/doc-coverage'
import { EntropyAnalyzer } from '../entropy/analyzer'
import { DriftConfig } from '../entropy/types'
import { accumulateLoss, computeGateLosses } from '../gate-loss'
import { TrackerSyncAdapter } from '../roadmap/tracker-sync'
import { parseSecurityConfig } from '../security/config'
import { SECURITY_SCAN_DEFAULT_IGNORE, SECURITY_SCAN_GLOB } from '../security/scan-targets'
import { SecurityScanner } from '../security/scanner'
import { TypeScriptParser } from '../shared/parsers'
import { Err, Ok, Result } from '../shared/result'
import { formatCIReportAsMarkdown } from './report-formatter'
import { GATE_VERSIONS, MEMOIZABLE_CHECKS, VerdictCache, VerdictCacheStatsCollector, computeConfigHash, computeProjectInputHash, computeVerdictKey, parseVerdictCacheConfig } from './verdict-cache'
import { GraphStore, queryTraceability, resolveGraphDir, skipDirGlobs } from '@harness-engineering/graph'
import { CICheckExitCode, CICheckIssue, CICheckName, CICheckReport, CICheckResult, CICheckSummary, CIFailOnSeverity, CINotifyOptions, ConstraintPackCompliance, ConstraintPackComplianceStatus, ConstraintStage, GateMeasurement, VerdictCacheStats, ZERO_DENOMINATOR_EXIT_CODE } from '@harness-engineering/types'
import { glob } from 'glob'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
