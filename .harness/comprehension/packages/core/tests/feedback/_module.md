---
schemaVersion: 1
module: 'packages/core/tests/feedback'
sourceHash: '42d3e4848a4af636552f431cfe56bb84eba1ee8520109e0fdb93f1ae8054e439'
compiledAt: '2026-08-28T01:22:10.847Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['config.test.ts', 'graph-integration.test.ts', 'index.test.ts', 'types.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import * as feedback, { ChecklistBuilder, analyzeDiff, createSelfReview, parseDiff } from '../../src/feedback'
import { configureFeedback, getFeedbackConfig, resetFeedbackConfig } from '../../src/feedback/config'
import { ActionContext, ActionEvent, ActionEventType, ActionResult, ActionType, AgentAction, AgentConfig, AgentProcess, AgentType, ChangedFile, CodeChanges, CustomRule, CustomRuleResult, ExecutorHealth, FeedbackError, ForbiddenPattern, GraphHarnessCheckData, GraphImpactData, LogEntry, LogFilter, Metric, PeerReview, PeerReviewOptions, ReviewChecklist, ReviewComment, ReviewContext, ReviewItem, SelfReviewConfig, Span, SpanEvent, TelemetryHealth, TimeRange, Trace } from '../../src/feedback/types'
import { beforeEach, describe, expect, it } from 'vitest'
```
