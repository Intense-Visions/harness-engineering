---
schemaVersion: 1
module: 'packages/core/src/review/output'
sourceHash: '30e65459cffda537cc5ac34de0e0b3526eec2fcdbc2d2a9a21b84aac67551e87'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'assessment.ts',
    'clump-comments.test.ts',
    'clump-comments.ts',
    'format-github.ts',
    'format-terminal.ts',
    'index.ts',
  ]
---

## Interface Contract

```ts
export ClumpedCommentReport
export ClumpedCommentResult
export FormatClumpedCommentsOptions
export determineAssessment
export formatClumpComment
export formatClumpedComments
export formatDepthHeader
export formatFindingBlock
export formatGitHubComment
export formatGitHubSummary
export formatIntegritySection
export formatTerminalOutput
export getExitCode
export isSmallSuggestion
export scopeOfPath
export toClumpableFinding
```

## Dependency Slice

```
import { Clump, ClumpPolicy, ClumpableItem, formClumps, resolveFloor } from '../../fleet/clumping'
import { SEVERITY_LABELS, SEVERITY_ORDER, SEVERITY_RANK } from '../constants'
import { DepthCalibration } from '../depth-calibrator'
import { FindingIntegrityReport } from '../finding-integrity'
import { EvidenceCoverageReport, FindingSeverity, GitHubInlineComment, ReviewAssessment, ReviewFinding, ReviewStrength } from '../types'
import { determineAssessment } from './assessment'
import { formatClumpedComments, scopeOfPath, toClumpableFinding } from './clump-comments'
import { formatGitHubComment, sanitizeMarkdown } from './format-github'
import { describe, expect, it } from 'vitest'
```
