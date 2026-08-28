---
schemaVersion: 1
module: 'packages/core/tests/feedback/integration'
sourceHash: 'd7033aaed6890ba2e542587a3b2392063ae8af960efc0705a149e45525a95f11'
compiledAt: '2026-08-28T01:22:10.845Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['full-workflow.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { NoOpExecutor, NoOpSink, configureFeedback, createSelfReview, getActionEmitter, parseDiff, requestPeerReview, resetFeedbackConfig } from '../../../src/feedback'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
