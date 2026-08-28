---
schemaVersion: 1
module: "packages/signals/tests/providers"
sourceHash: "46bb52ce9d6fa6d5317269153b957c27f2aaa94919a50ccdde269edd9aa48751"
compiledAt: "2026-08-28T01:22:12.801Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["baseline-updates.test.ts", "complexity-trend.test.ts", "coverage-trend.test.ts", "eval-fail-rate.test.ts", "pr-review.test.ts"]
---

## Summary

This test module validates a provider ecosystem that computes health signals about a codebase. Each provider observes a health dimension (baseline churn, complexity drift, coverage trends, eval failures, PR review load) and returns a standardized Signal record: current value, historical trend, and thresholds that trigger warn/alert states. baselineUpdatesProvider counts auto-refresh-baseline commits from github-actions[bot] in the past 30 days (thresholds: warn 1, alert 5); complexityTrendProvider reads architecture complexity snapshots from `.harness/arch/timeline.json` and detects percentage rises over 30 days (warn ≥5%, alert ≥15%). The module demonstrates strict data filtering, graceful degradation when dependencies fail, and a consistent signal contract across providers.

## Invariants

- Each provider exports a constant with id, label, and compute(ctx: SignalContext): Promise<Signal>
- Git log parsing must handle newline-separated records with field separators (US = '\x1f'); field boundaries must not bleed across record lines
- All trend providers use 30-day lookback from now; snapshots outside that window are excluded from trend calculation
- History must bucket data daily across the full 30-day window; gaps are backfilled even if events are sparse
- Latest value is always mirrored to the timeline store keyed by the current date, enabling cross-signal aggregation
- When a dependency fails (git unavailable, file missing, command error), return status='error' with value=null and history=[] instead of throwing
- Threshold comparison logic is semantic, not arithmetic—usually a percentage change or delta against a baseline, not a raw value comparison
- History points appear in chronological order (earliest to latest)
- Single snapshot in the window yields trend='flat' and status='ok'; trend detection requires ≥2 points
- Providers that read from a file include source field (e.g., 'arch/timeline.json') in the Signal for auditability

## Interface Contract

```ts

```

## Dependency Slice

```
import { baselineUpdatesProvider } from '../../src/providers/baseline-updates'
import { complexityTrendProvider } from '../../src/providers/complexity-trend'
import { coverageTrendProvider } from '../../src/providers/coverage-trend'
import { evalFailRateProvider } from '../../src/providers/eval-fail-rate'
import { prReviewProvider } from '../../src/providers/pr-review'
import { SignalTimelineStore } from '../../src/timeline-store'
import { CommandRunner, SignalContext } from '../../src/types'
import { GraphNode, GraphStore } from '@harness-engineering/graph'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
