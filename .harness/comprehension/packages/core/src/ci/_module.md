---
schemaVersion: 1
module: 'packages/core/src/ci'
sourceHash: '96c07b01b211571da7b908e3914156933ec306c28af03cfd9415154649934cf7'
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
import { accumulateLoss, computeGateLosses } from '../gate-loss'
import { TrackerSyncAdapter } from '../roadmap/tracker-sync'
import { parseSecurityConfig } from '../security/config'
import { SECURITY_SCAN_GLOB } from '../security/scan-targets'
import { SecurityScanner } from '../security/scanner'
import { TypeScriptParser } from '../shared/parsers'
import { Err, Ok, Result } from '../shared/result'
import { formatCIReportAsMarkdown } from './report-formatter'
import { GraphStore, queryTraceability, resolveGraphDir, skipDirGlobs } from '@harness-engineering/graph'
import { CICheckIssue, CICheckName, CICheckReport, CICheckResult, CICheckSummary, CIFailOnSeverity, CINotifyOptions, ConstraintPackCompliance, ConstraintPackComplianceStatus, ConstraintStage, GateMeasurement } from '@harness-engineering/types'
import from 'glob'
import * as path from 'node:path'
```
