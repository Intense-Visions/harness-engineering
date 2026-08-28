---
schemaVersion: 1
module: 'packages/core/src/feedback'
sourceHash: 'b516118b5d29e6ec747fd7e0e5010b2a38f700c9fe3c40bd61e9e27cacd0456b'
compiledAt: '2026-08-28T01:22:10.375Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['config.ts', 'index.ts', 'types.ts']
---

## Interface Contract

```ts
export ActionContext
export ActionEvent
export ActionEventHandler
export ActionEventType
export ActionResult
export ActionSink
export ActionTracker
export ActionType
export AgentAction
export AgentActionEmitter
export AgentExecutor
export AgentProcess
export AgentType
export ChangedFile
export ChecklistBuilder
export CodeChanges
export ConsoleSink
export CustomRule
export CustomRuleResult
export ExecutorHealth
export FeedbackAgentConfig
export FeedbackConfig
export FeedbackError
export FileSink
export ForbiddenPattern
export GraphHarnessCheckData
export GraphImpactData
export LogEntry
export LogFilter
export Metric
export NoOpExecutor
export NoOpSink
export NoOpTelemetryAdapter
export PeerReview
export PeerReviewOptions
export ReviewChecklist
export ReviewComment
export ReviewContext
export ReviewItem
export SelfReviewConfig
export Span
export SpanEvent
export TelemetryAdapter
export TelemetryHealth
export TimeRange
export Trace
export analyzeDiff
export configureFeedback
export createSelfReview
export getActionEmitter
export getFeedbackConfig
export logAgentAction
export parseDiff
export requestMultiplePeerReviews
export requestPeerReview
export resetFeedbackConfig
export trackAction
```

## Dependency Slice

```
import { BaseError } from '../shared/errors'
import { NoOpExecutor } from './executor/noop'
import { ConsoleSink } from './logging/console-sink'
import { NoOpTelemetryAdapter } from './telemetry/noop'
import { ActionSink, AgentExecutor, TelemetryAdapter } from './types'
```
