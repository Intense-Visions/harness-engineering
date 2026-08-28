---
schemaVersion: 1
module: 'packages/core/tests/feedback'
sourceHash: '42d3e4848a4af636552f431cfe56bb84eba1ee8520109e0fdb93f1ae8054e439'
compiledAt: '2026-08-28T01:22:10.847Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['config.test.ts', 'graph-integration.test.ts', 'index.test.ts', 'types.test.ts']
---

## Summary

The feedback test module (`packages/core/tests/feedback`) validates the feedback subsystem's core contracts across four dimensions. **config.test.ts** verifies that configuration is immutable (frozen), supports partial updates without losing unspecified fields, and resets cleanly to defaults with emitEvents, defaultTimeout (300s), telemetry, executor, and non-empty sinks. **graph-integration.test.ts** is the heavyweight: it tests two analysis paths where graph data (`GraphImpactData`) triggers real checks against node counts, undocumented/unreachable nodes, and impact scope; without graph data, functions emit placeholder results that pass trivially. **index.test.ts** is a smoke test confirming all public exports exist (config, review functions, diff analyzer, NoOp implementations, sinks, logging). **types.test.ts** validates the shape of core types (FeedbackError, ReviewChecklist, AgentAction, CodeChanges) by constructing valid instances and accessing key fields. Together, these tests enforce that the module's public API is complete, its configuration is safe, and its graph-integration fallback paths are predictable.

## Invariants

- Config immutability: getFeedbackConfig() returns Object.frozen; mutations flow only through configureFeedback() and resetFeedbackConfig(). Callers cannot mutate the returned config.
- Partial updates preserve state: configureFeedback({ field: newValue }) merges, does not replace. Unspecified fields retain their values.
- Graph data gates behavior, not existence: ChecklistBuilder and analyzeDiff() accept optional graph data. With it: real checks (node count, constraint violations, entropy). Without it: placeholder results that always pass. Downstream code must handle both paths.
- Two test-coverage detection paths coexist: Graph-based (via affectedTests array) and filename heuristics (fallback). Both are valid, tested separately, not mutually exclusive.
- Impact scope has a warning threshold: impactScope >= 25 generates a review item with id='impact-scope', severity='warning'. Lower values do not flag.
- ReviewChecklist.summary has exactly five counters: { total, passed, failed, errors, warnings }. Callers depend on all five being present.
- No implicit global state for graph data: Graph impact and harness-check data are passed explicitly to each function. No thread-local or module-level graph context.

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
