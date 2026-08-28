---
schemaVersion: 1
module: 'packages/core/src/ci'
sourceHash: '4dd8c94ce16f08b3e6c5d316facf366e9c1ab0842db282c1f0aa3344df0fb312'
compiledAt: '2026-08-28T01:22:10.290Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['base-freshness.ts', 'check-orchestrator.ts', 'index.ts', 'notifier.ts', 'report-formatter.ts']
---

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
