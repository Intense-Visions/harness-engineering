---
schemaVersion: 1
module: 'packages/core/src/feedback'
sourceHash: 'b516118b5d29e6ec747fd7e0e5010b2a38f700c9fe3c40bd61e9e27cacd0456b'
compiledAt: '2026-08-28T01:22:10.375Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['config.ts', 'index.ts', 'types.ts']
---

## Summary

`packages/core/src/feedback` is a pluggable feedback orchestration module that automates code review through three channels: self-review (automated checks), peer-review (agent-based assessment), and action tracking (observability). It's a configurables adapter stack with no hard-coded implementations. Core responsibilities: (1) Configuration — global singleton pattern that wires adapters (telemetry, executor, logging sinks) with sensible defaults; (2) Review pipelines — createSelfReview runs checklists of harness rules + custom rules + diff analysis, requestPeerReview spawns agents via executor and tracks results; (3) Diff analysis — parseDiff and analyzeDiff extract impacted files and feed data into ChecklistBuilder; (4) Action tracking — every review, agent spawn, and telemetry query becomes an AgentAction logged to sinks with typed events; (5) Graph integration — optional graph data enriches reviews via GraphImpactData and GraphHarnessCheckData. Key structure spans config.ts (singleton + defaults), review/ (orchestration + parsing), executor/telemetry/logging/ (adapters + no-ops), and types.ts (~40 types).

## Invariants

- Singleton config pattern is lazy-initialized via ensureConfig() and frozen—custom adapters must be wired before first review or defaults are used; resetFeedbackConfig() is testing-only.
- All adapter methods return Result<T, FeedbackError>, never throw—callers must unwrap; adapter failures are isolated from review logic.
- ReviewChecklist.summary is derived at construction time, not auto-updated—mutating items[] after building leaves counts stale.
- Custom rules and graph data are optional but composable—code must handle absence gracefully (null-checks required).
- ActionTracker.complete() or .fail() must be called to close an action—forgetting either leaves it in 'started' state forever (resource leak risk).
- ActionEventType wildcard 'action:\*' broadcasts all three concrete events (started, completed, failed)—listeners subscribing to wildcard must handle all three.
- ChangedFile.status is a finite enum (added|modified|deleted|renamed)—diff parsers mapping raw git statuses must normalize or drop unmapped statuses.
- TelemetryAdapter.health() and AgentExecutor.health() are async and not cached—no O(1) latency guarantee; slow health() blocks the workflow.
- CustomRule.check() is async and respects parent review timeout—slow rules block entire self-review, not isolated.
- PeerReviewOptions.wait=false returns immediately with process ID, not result—callers must explicitly call AgentExecutor.wait() later; PeerReview fields are stale if checked immediately.
- Diff analysis forbiddenPatterns are RegExp matched per-file with optional fileGlob scope—pattern without glob applies to all files.
- Review checklist items should populate file/line pointers when available—omitting them loses UI click-through granularity.

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
