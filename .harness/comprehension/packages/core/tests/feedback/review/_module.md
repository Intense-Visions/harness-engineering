---
schemaVersion: 1
module: 'packages/core/tests/feedback/review'
sourceHash: '86210b7854dad7a0dc01a66badbf5c8fa43a9080084025f3c23132cec6669771'
compiledAt: '2026-08-28T01:22:10.854Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['checklist.test.ts', 'diff-analyzer.test.ts', 'peer-review.test.ts', 'self-review.test.ts']
---

## Summary

This module tests the code-review feedback subsystem, which orchestrates multi-agent review workflows through four main components. ChecklistBuilder is a fluent API that composes rules, diff analysis, and harness checks into reviewable checklists, running rules against code changes and aggregating pass/fail/severity summaries. The diff analyzer parses unified diffs into structured file/change metadata and evaluates against forbidden patterns (console.log, large PRs, etc.); analysis can be disabled entirely. Peer review requests code reviews from named agent types either singly or in parallel batches, yielding structured verdicts. Self-review combines checklist + diff analysis + optional custom rules to produce time-stamped summaries. All operations return Result<T> discriminated unions; tests use NoOp implementations (executor, sink) for deterministic feedback and reset config before each test to prevent cross-test pollution.

## Invariants

- Result unwrapping is mandatory — every operation returns Result<T>; tests must check .ok before accessing .value
- Config isolation per test — beforeEach calls resetFeedbackConfig() then configureFeedback() with NoOpExecutor/NoOpSink; forgetting this causes state bleed
- NoOp always approves — test peers return approved: true by design; don't rely on rejection paths without mocking
- Checklist summary is severity-aware — counts total, passed, failed, errors (severity='error'), warnings (severity='warning') independently; severity='error' fails the whole checklist
- Diff analysis is async — both parseDiff() and analyzeDiff() are async and must be awaited
- File status enum is strict — status must be 'added' | 'modified' | 'deleted'; other values are invalid
- Method chaining returns builder — ChecklistBuilder methods (addRule, addRules, withDiffAnalysis, withHarnessChecks) return this for fluent composition
- Multiple peer reviews execute in parallel — requestMultiplePeerReviews([...]) does not sequence requests

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
