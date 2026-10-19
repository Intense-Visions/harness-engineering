---
schemaVersion: 1
module: 'packages/core/src/ci'
sourceHash: 'e803c0dc157104921b7da0529ce4aaedaf927182ba0c248b3271381416faf02d'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'base-freshness.ts',
    'check-orchestrator.ts',
    'index.ts',
    'notifier.ts',
    'report-formatter.ts',
    'verdict-cache.ts',
  ]
---

## Interface Contract

```ts
export BaseFreshnessInput
export BaseFreshnessTrust
export BaseFreshnessVerdict
export CINotifier
export DEFAULT_VERDICT_CACHE_DIR
export GATE_VERSIONS
export MEMOIZABLE_CHECKS
export RunCIChecksInput
export VerdictCache
export VerdictCacheConfig
export VerdictCacheStatsCollector
export classifyBaseFreshness
export computeConfigHash
export computeProjectInputHash
export computeVerdictKey
export formatCIReportAsMarkdown
export parseVerdictCacheConfig
export runCIChecks
export shouldCacheResult
```

## Dependency Slice

```
import { ArchConfigSchema, readDependencyRules, runArchCollectors, withDependencyRules } from '../architecture'
import { ArchBaselineManager } from '../architecture/baseline-manager'
import { filterDiffByAllowances, loadArchAllowances, resolveArchBaseline } from '../architecture/baseline-resolver'
import { diff } from '../architecture/diff'
import { computeSourceHash } from '../comprehension/source-hash'
import { defineLayer, validateDependencies } from '../constraints/dependencies'
import { ResolvedConstraintPacks, resolveConstraintPacks } from '../constraints/packs'
import { validateAgentsMap } from '../context/agents-map'
import { checkDocCoverage } from '../context/doc-coverage'
import { EntropyAnalyzer } from '../entropy/analyzer'
import { DriftConfig } from '../entropy/types'
import { accumulateLoss, computeGateLosses } from '../gate-loss'
import { TrackerSyncAdapter } from '../roadmap/tracker-sync'
import { parseSecurityConfig } from '../security/config'
import { SECURITY_SCAN_GLOB } from '../security/scan-targets'
import { SecurityScanner } from '../security/scanner'
import { TypeScriptParser } from '../shared/parsers'
import { Err, Ok, Result } from '../shared/result'
import { formatCIReportAsMarkdown } from './report-formatter'
import { GATE_VERSIONS, MEMOIZABLE_CHECKS, VerdictCache, VerdictCacheStatsCollector, computeConfigHash, computeProjectInputHash, computeVerdictKey, parseVerdictCacheConfig } from './verdict-cache'
import { GraphStore, queryTraceability, resolveGraphDir, skipDirGlobs } from '@harness-engineering/graph'
import { CICheckIssue, CICheckName, CICheckReport, CICheckResult, CICheckSummary, CIFailOnSeverity, CINotifyOptions, ConstraintPackCompliance, ConstraintPackComplianceStatus, ConstraintStage, GateMeasurement, VerdictCacheStats } from '@harness-engineering/types'
import { glob } from 'glob'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
