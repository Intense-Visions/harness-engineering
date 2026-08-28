---
schemaVersion: 1
module: 'packages/core/src/insights'
sourceHash: '660648fbb3a44950d019aa19239ee08d3ed1510c4fa0475c1d015eb92d6290a1'
compiledAt: '2026-08-28T01:22:10.423Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['aggregator.test.ts', 'aggregator.ts', 'index.ts']
---

## Summary

`packages/core/src/insights` is a composite analyzer that aggregates five structural health metrics—entropy, decay, attention (session tracking), impact (blast radius), and health—into a single `InsightsReport` via `composeInsights()`. Each block is wrapped in try/catch for resilience; one analyzer failure produces a warning, not a crash. Blocks run in parallel and can be selectively skipped. The module lives in `core` (not dashboard) to allow reuse by both CLI and dashboard without violating layer boundaries.

## Invariants

- One analyzer failure must not crash the whole report; each block wrapped in try/catch with warning collection.
- Skipped keys always return null in the report shape, never undefined.
- Sessions in .harness/sessions older than 7 days (mtime) are counted as stale, not active.
- Impact cache at .harness/cache/impact.json is optional; missing file silently returns empty recentBlastRadius array.
- EntropyAnalyzer is instantiated with drift:false, deadCode:true, patterns:false, complexity:false — these are fixed and cannot be overridden via composeInsights() options.
- Decay block's topAffected is capped at 5 items (MAX_TOP_AFFECTED constant).
- All five blocks run concurrently via Promise.all; sequential execution would break startup latency guarantees for interactive use.
- Empty project must return all five keys with sensible defaults (health.passed=true, entropy=all zeros), not error.

## Interface Contract

```ts
export ComposeInsightsOptions
export composeInsights
```

## Dependency Slice

```
import from '../architecture/timeline-manager.js'
import from '../entropy/analyzer.js'
import { composeInsights } from './aggregator'
import { INSIGHTS_KEYS, InsightsAttentionBlock, InsightsDecayBlock, InsightsEntropyBlock, InsightsHealthBlock, InsightsImpactBlock, InsightsKey, InsightsReport } from '@harness-engineering/types'
import * as fs from 'fs'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
