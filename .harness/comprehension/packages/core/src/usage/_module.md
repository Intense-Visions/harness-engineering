---
schemaVersion: 1
module: 'packages/core/src/usage'
sourceHash: 'b5a49c7b1ad1a19382e781b11955147b758b216a36ab3aa9ddfe7ae0a4faadcc'
compiledAt: '2026-08-28T01:22:10.664Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['aggregator.ts', 'cc-parser.ts', 'index.ts', 'jsonl-reader.ts']
---

## Summary

The `packages/core/src/usage` module aggregates API usage and cost records from Harness and Claude Code into session and daily summaries. It merges dual-source records (tagging by \_source), deduplicates Claude Code streaming chunks by requestId, accumulates token counts and costs, and sorts results descending by timestamp. Exports four functions: aggregateBySession (group by session ID with source merging), aggregateByDay (group by UTC calendar date), parseCCRecords (parse JSONL with dedup), and readCostRecords (load from storage).

## Invariants

- Source precedence: When both Harness and Claude Code records exist for a session, Harness token counts are authoritative; CC data supplements only the model field, and result is marked 'merged'.
- Streaming deduplication: Claude Code emits multiple assistant entries per API request (same requestId); only the last entry per requestId is retained.
- Null cost propagation: If any record has unknown cost (costMicroUSD: null), the aggregated result's cost becomes null.
- UTC date bucketing: Daily aggregation uses YYYY-MM-DD prefix of ISO timestamp directly with no timezone-aware parsing.
- Descending timestamp sort: Both aggregateBySession and aggregateByDay return results sorted descending (most recent first).
- Optional fields preserved: model, cacheCreationTokens, and cacheReadTokens are only included if present and non-zero in source records.
- Model resolution for sessions: Uses Harness model if available, falls back to Claude Code model, then undefined. Days collect all distinct models sorted alphabetically.

## Interface Contract

```ts
export aggregateByDay
export aggregateBySession
export parseCCRecords
export readCostRecords
```

## Dependency Slice

```
import { DailyUsage, SessionUsage, TokenUsage, UsageRecord } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
```
