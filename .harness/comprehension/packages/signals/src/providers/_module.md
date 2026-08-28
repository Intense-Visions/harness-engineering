---
schemaVersion: 1
module: "packages/signals/src/providers"
sourceHash: "0cb9d5d96e8ee74623c1979943ecbdc649177a707038de0586eb50c93222767a"
compiledAt: "2026-08-28T01:22:12.750Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["baseline-updates.ts", "complexity-trend.ts", "coverage-trend.ts", "eval-fail-rate.ts", "pr-review.ts"]
---

## Summary

The `packages/signals/src/providers` module implements five curated health signals for project monitoring over a rolling 30-day window. Each provider conforms to the `SignalProvider` interface—taking a `SignalContext` and returning a `SignalResult` with a status (ok/warn/alert/pending/error), value, trend, history, and human-readable detail.

**The five providers:**

1. **`prReviewProvider`** — Counts PRs merged without multi-persona review by querying `gh pr list` for merged PRs and checking reviews for the "## Assessment:" marker. Warns at ≥1, alerts at ≥3. Includes truncation guard if fetch hits gh's 500-PR cap.

2. **`coverageTrendProvider`** — Derives line-coverage trend from git history of `coverage-baselines.json`. Shells to `git log --since=30d` then `git show <sha>:coverage-baselines.json` per commit. Aggregates by mean `lines%` across packages per commit, buckets by day (latest same-day commit wins), reports percentage-point delta. Warns at ≤−1pp, alerts at ≤−5pp.

3. **`complexityTrendProvider`** — Reads architecture time-series from `.harness/arch/timeline.json`, extracts complexity metric over 30-day window, reports percentage rise `(latest − earliest) / earliest × 100`. Warns at +5%, alerts at +15%.

4. **`baselineUpdatesProvider`** — Counts CI-driven baseline-refresh commits by shelling to `git log -- '*-baselines.json'` and filtering by BOTH author `github-actions[bot]` AND message prefix `chore: refresh baselines`. Warns at ≥1, alerts at ≥5.

5. **`evalFailRateProvider`** — Post-merge evaluation failure rate from knowledge graph. Queries `execution_outcome` nodes by `metadata.result` ('success'|'failure') and `metadata.timestamp`, computes fail% = failures/(failures+successes)×100. Warns at >5%, alerts at >10%. Returns status `'pending'` if no nodes exist yet.

## Invariants

- Error/pending results never throw — all providers catch exceptions and return degraded `error`/`pending` `SignalResult` structs instead of crashing the panel
- History is sorted chronologically — all providers sort daily buckets oldest→newest before returning as `SignalPoint[]`
- Current value always appended to timeline store — every provider calls `ctx.timeline.appendPoint()` after computing to ensure steady-state continuity
- Backfill is idempotent — providers call `ctx.timeline.backfill()` which is safe to call repeatedly with the same history
- Date format is `YYYY-MM-DD` (UTC) — all buckets and points use this format via the `toDate()` helper which truncates ISO strings
- Command runner is injectable — providers use `ctx.runCommand ?? defaultCommandRunner`, allowing test mocks to be passed via `SignalContext`
- Thresholds are hardcoded per provider — each signal owns its `THRESHOLD` constant with `warn`/`alert` levels; no dynamic configuration
- Coverage aggregates mean lines% — only metric bucketed for history; `aggregateCoverage()` documents the assumption and is the single point to change if team prefers weighted-by-LOC or `statements`
- PR review marker is canonical — `ASSESSMENT_MARKER` ('## Assessment:') is imported from `shared.ts` so all consumers stay in sync
- Truncation guard on PR fetches — when `gh pr list --limit 500` returns exactly 500 rows, result is annotated as lower bound not silently undercounted
- All five providers registered in `signalRegistry` in canonical display order and executed concurrently via `Promise.allSettled`

## Interface Contract

```ts
export baselineUpdatesProvider
export complexityTrendProvider
export coverageTrendProvider
export evalFailRateProvider
export prReviewProvider
```

## Dependency Slice

```
import { defaultCommandRunner } from '../command-runner'
import { ASSESSMENT_MARKER, bucketsToHistory, deriveEndpointTrend, round2, toDate } from '../shared'
import { CommandRunner, SignalContext, SignalPoint, SignalProvider, SignalResult } from '../types'
import { GraphNode } from '@harness-engineering/graph'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
```
