---
schemaVersion: 1
module: 'packages/core/tests/feedback/review'
sourceHash: '86210b7854dad7a0dc01a66badbf5c8fa43a9080084025f3c23132cec6669771'
compiledAt: '2026-08-28T01:22:10.854Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['checklist.test.ts', 'diff-analyzer.test.ts', 'peer-review.test.ts', 'self-review.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { configureFeedback, resetFeedbackConfig } from '../../../src/feedback/config'
import { NoOpExecutor } from '../../../src/feedback/executor/noop'
import { NoOpSink } from '../../../src/feedback/logging/sink'
import { ChecklistBuilder } from '../../../src/feedback/review/checklist'
import { analyzeDiff, parseDiff } from '../../../src/feedback/review/diff-analyzer'
import { requestMultiplePeerReviews, requestPeerReview } from '../../../src/feedback/review/peer-review'
import { createSelfReview } from '../../../src/feedback/review/self-review'
import { CodeChanges, CustomRule } from '../../../src/feedback/types'
import { join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
```
