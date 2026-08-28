---
schemaVersion: 1
module: 'packages/core/src/review/output'
sourceHash: 'f9d2b36af55a2e6e36953d539bac6a934b6fde4ac1caa5b1ef63f27bc0505304'
compiledAt: '2026-08-28T01:22:10.490Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['assessment.ts', 'format-github.ts', 'format-terminal.ts', 'index.ts']
---

## Interface Contract

```ts
export determineAssessment
export formatDepthHeader
export formatFindingBlock
export formatGitHubComment
export formatGitHubSummary
export formatIntegritySection
export formatTerminalOutput
export getExitCode
export isSmallSuggestion
```

## Dependency Slice

```
import { SEVERITY_LABELS, SEVERITY_ORDER, SEVERITY_RANK } from '../constants'
import { DepthCalibration } from '../depth-calibrator'
import { FindingIntegrityReport } from '../finding-integrity'
import { EvidenceCoverageReport, FindingSeverity, GitHubInlineComment, ReviewAssessment, ReviewFinding, ReviewStrength } from '../types'
import { determineAssessment } from './assessment'
```
