---
schemaVersion: 1
module: 'packages/core/src/feedback/review'
sourceHash: '9750668e1d46cc7c93f462835bac1483212d4062fe61ecc3bce5ff11cc2ae3a5'
compiledAt: '2026-08-28T01:22:10.384Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['checklist.ts', 'diff-analyzer.ts', 'peer-review.ts', 'self-review.ts']
---

## Interface Contract

```ts
export ChecklistBuilder
export analyzeDiff
export createSelfReview
export parseDiff
export requestMultiplePeerReviews
export requestPeerReview
```

## Dependency Slice

```
import { Err, Ok, Result } from '../../shared/result'
import { getFeedbackConfig } from '../config'
import { trackAction } from '../logging/emitter'
import { AgentType, ChangedFile, CodeChanges, CustomRule, FeedbackError, GraphHarnessCheckData, GraphImpactData, PeerReview, PeerReviewOptions, ReviewChecklist, ReviewContext, ReviewItem, SelfReviewConfig } from '../types'
import { ChecklistBuilder } from './checklist'
import { analyzeDiff } from './diff-analyzer'
```
