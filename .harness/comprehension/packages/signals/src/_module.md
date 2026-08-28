---
schemaVersion: 1
module: "packages/signals/src"
sourceHash: "1b711786e5b98bdc27a20231ce95af3b8e3ecbeac9d3fb6987347ebd8a3d0f18"
compiledAt: "2026-08-28T01:22:12.775Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["command-runner.ts", "gather.ts", "holiday-confidence.ts", "index.ts", "registry.ts", "shared.ts", "timeline-store.ts", "types.ts"]
---

## Summary

**`packages/signals/src`** is a metrics-collection system that monitors repository health via five curated signals computed over a rolling 30-day window. Each signal (e.g., PR review coverage, code coverage trend, complexity trend) is a `SignalProvider` that queries live data (git history, graph nodes, `gh` API) and persists daily data points to a time-series cache. The module composes these signals into a "Holiday Confidence" KPI—answering whether the codebase is safe to leave unwatched—by checking if merged PRs cleared all four gates: multi-persona review, post-merge eval success, no baseline auto-updates, and no signal breaches. Providers run concurrently with graceful degradation (one failure yields an `error` card, doesn't sink the others). All providers are injectable (`CommandRunner`, `GraphStore`) so tests can mock git/gh calls and the graph.

## Invariants

- Signal registry is canonical and ordered — signalRegistry array defines the five providers in display order (pr-review, coverage, complexity, baseline, eval). gatherSignals iterates this array with Promise.allSettled and maps results back by index; changing order or count changes the UI layout and composed Holiday Confidence logic.
- Timeline store is atomic and self-healing — .harness/signals/timeline.json uses temp+rename writes to survive crashes. Corrupt/missing files soft-fail to empty (never throw), so a bad cache never blocks the panel. Each signal's history is capped at 30 points oldest-trimmed.
- Assessment Marker is a shared constant — ASSESSMENT_MARKER ('## Assessment:') is emitted by core/src/review/output/format-github.ts and consumed by both pr-review signal and Holiday Confidence KPI. If the review pipeline changes its summary format, this single const must be updated or both will drift.
- Per-PR outcome-eval linkage uses commit shas — Holiday Confidence matches PRs to execution_outcome graph nodes by head ref sha or merge commit sha. The graph connector must map non-SATISFIED verdict to result: 'failure' and store commit metadata under metadata.commit or metadata.headSha, or criterion (b) degrades to pass-with-note.
- Trend is endpoint-delta, not slope — deriveEndpointTrend compares earliest to latest point in history (< 2 points → 'flat'), NOT a regression/best-fit. Providers needing value-aware delta (coverage, complexity) compute percentage-point/percentage change independently.
- Provider errors are self-contained — toErrorResult wraps rejections as standalone cards (never re-thrown). Promise.allSettled guarantees all five results are returned; one provider throwing does not propagate.
- Default window is 30 days, shared — DEFAULT_WINDOW_DAYS is used by every signal and Holiday Confidence KPI. Changing it changes the scope of all metrics; providers may override locally but new consumers should default to this constant.
- Fetch limits are documented truncation guards — pr-review and Holiday Confidence both fetch up to 500 PRs from gh pr list --limit 500. If window has ≥500 PRs, the tail is silently dropped by gh. When returned count equals the limit, detail is annotated 'may be truncated' rather than reporting false low count.

## Interface Contract

```ts
export ASSESSMENT_MARKER
export CommandRunner
export DEFAULT_WINDOW_DAYS
export HolidayConfidenceCriteria
export HolidayConfidenceInput
export HolidayConfidenceResult
export HolidayConfidenceStatus
export OutcomeQueryStore
export SignalContext
export SignalId
export SignalPoint
export SignalProvider
export SignalResult
export SignalStatus
export SignalTimelineStore
export SignalsResult
export computeHolidayConfidence
export defaultCommandRunner
export gatherSignals
export signalRegistry
```

## Dependency Slice

```
import { CommandRunner, defaultCommandRunner } from './command-runner'
import { baselineUpdatesProvider } from './providers/baseline-updates'
import { complexityTrendProvider } from './providers/complexity-trend'
import { coverageTrendProvider } from './providers/coverage-trend'
import { evalFailRateProvider } from './providers/eval-fail-rate'
import { prReviewProvider } from './providers/pr-review'
import { signalRegistry } from './registry'
import { ASSESSMENT_MARKER, DEFAULT_WINDOW_DAYS, round2 } from './shared'
import { SignalTimelineStore } from './timeline-store'
import { CommandRunner, SignalContext, SignalId, SignalPoint, SignalProvider, SignalResult } from './types'
import { GraphStore, resolveGraphDir } from '@harness-engineering/graph'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
```
