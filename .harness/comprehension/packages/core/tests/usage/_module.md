---
schemaVersion: 1
module: 'packages/core/tests/usage'
sourceHash: 'cf2df9d69d3757e0fcc8a648cdf86f74a48499087e3a7350bfda8ca90ec0b803'
compiledAt: '2026-08-28T01:22:11.130Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['aggregator.test.ts', 'cc-parser.test.ts', 'jsonl-reader.test.ts']
---

## Summary

`packages/core/tests/usage` is a test suite for usage tracking aggregation across Harness and Claude Code sessions. It tests three core utilities: aggregator (session and daily rollups), cc-parser (JSONL parsing from Claude Code sessions), and jsonl-reader (cost file reading). The module handles merging heterogeneous usage records (harness telemetry + Claude Code logs), normalizing them into session-level and daily summaries with token counts, costs, and model metadata. It has special handling for optional cache token fields (for newer cached API calls) and gracefully downgrades cost to null when any constituent record lacks pricing.

## Invariants

- Cost nullification propagates: if any record in a session/day has costMicroUSD: null, the aggregate is null
- Token fields always sum; cache fields (cacheCreationTokens, cacheReadTokens) may be undefined if absent in all records
- Session aggregation takes model from first non-empty record; day aggregation collects all distinct models (sorted)
- Harness records are authoritative for tokens; CC records supplement with model metadata in merge scenarios
- Results always sorted descending by timestamp (most recent first, both session and day aggregations)
- CC parser silently tolerates malformed input: non-assistant entries, missing message.usage, and invalid JSON lines are skipped with warning
- Cache token fields are optional and absent in legacy records; aggregation must handle undefined gracefully, not treat as zero

## Interface Contract

```ts

```

## Dependency Slice

```
import { aggregateByDay, aggregateBySession } from '../../src/usage/aggregator'
import { parseCCRecords } from '../../src/usage/cc-parser'
import { readCostRecords } from '../../src/usage/jsonl-reader'
import { UsageRecord } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
