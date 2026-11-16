---
schemaVersion: 1
module: 'packages/core/src/review/output'
sourceHash: '75a76273b7d9b613a329aa44ceac6c9e9938ac903f4ce4c349e11cd85844ca95'
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
export toClumpableFinding
```

## Dependency Slice

```
import { Clump, ClumpPolicy, ClumpableItem, formClumps, resolveFloor, scopeOfPath, withOrdinals } from '../../fleet/clumping'
import { SEVERITY_LABELS, SEVERITY_ORDER, SEVERITY_RANK } from '../constants'
import { DepthCalibration } from '../depth-calibrator'
import { FindingIntegrityReport } from '../finding-integrity'
import { ClumpedCommentReport, EvidenceCoverageReport, FindingSeverity, GitHubInlineComment, ReviewAssessment, ReviewFinding, ReviewStrength } from '../types'
import { determineAssessment } from './assessment'
import { formatClumpedComments, toClumpableFinding } from './clump-comments'
import { formatGitHubComment, isSmallSuggestion, sanitizeMarkdown } from './format-github'
import { describe, expect, it } from 'vitest'
```
