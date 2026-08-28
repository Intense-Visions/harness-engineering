---
schemaVersion: 1
module: 'packages/core/tests/review/output'
sourceHash: '7648cb54bb9e058a504f8f54c5e82b3a8f3537f06a53e08096963583fb98c470'
compiledAt: '2026-08-28T01:22:10.892Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['assessment.test.ts', 'format-github.test.ts', 'format-terminal.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { determineAssessment, getExitCode } from '../../../src/review/output/assessment'
import { formatGitHubComment, formatGitHubSummary, isSmallSuggestion } from '../../../src/review/output/format-github'
import { formatFindingBlock, formatTerminalOutput } from '../../../src/review/output/format-terminal'
import { ReviewFinding, ReviewStrength } from '../../../src/review/types'
import { describe, expect, it } from 'vitest'
```
