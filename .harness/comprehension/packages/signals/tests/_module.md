---
schemaVersion: 1
module: "packages/signals/tests"
sourceHash: "c7606eba1d53ab26a55afbcbcd69819ed53a0e7b4716f3824278019c28a3204b"
compiledAt: "2026-08-28T01:22:12.797Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["command-runner.test.ts", "gather.test.ts", "holiday-confidence.test.ts", "shared.test.ts", "timeline-store.test.ts"]
---

## Summary

The `packages/signals/tests` module validates a three-layer signal-collection and confidence-scoring system. The command-execution layer tests subprocess spawning with a 30-second budget to tolerate host load without masking genuine hangs. The signal-gathering layer validates collection of five curated signals from a registry with graceful isolation—a throwing provider surfaces as an error card without crashing siblings. The holiday-confidence layer validates a four-criterion safety gate for deployments: (a) multi-persona review via "## Assessment:" marker, (b) outcome-eval pass linked by commit SHA, (c) no baseline auto-updates, (d) no signal breaches. Confidence = (passing PRs / merged PRs in window) × 100; returns pending when no PRs merge, and degrades gracefully when dependencies unavailable.

## Invariants

- Subprocess timeout fixed at 30s to isolate slow-host noise from genuine hangs during parallel suite runs
- Provider isolation: gather must catch and wrap individual provider failures as error cards; registry order preserved
- Four-criterion conjunction for confidence: all gates must hold (not degraded) for any PR to count confident; any window-scope gate failure → 0% confidence
- Commit SHA linkage: outcome-eval verdict tied to specific commit (headRefOid or mergeCommit.oid); missing graph store marks criterion (b) degraded but passes PRs
- Window boundary: PRs merged before cutoff excluded; default 30 days from now
- Review body pattern: multi-persona detection keyed on substring '## Assessment: Approve'; plain 'lgtm' rejects

## Interface Contract

```ts

```

## Dependency Slice

```
import { CommandRunner, defaultCommandRunner } from '../src/command-runner'
import from '../src/gather'
import { OutcomeQueryStore, computeHolidayConfidence } from '../src/holiday-confidence'
import { bucketsToHistory, deriveEndpointTrend, round2, toDate } from '../src/shared'
import { SignalTimelineStore } from '../src/timeline-store'
import { CommandRunner, SignalId, SignalPoint, SignalProvider, SignalResult, SignalStatus } from '../src/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
