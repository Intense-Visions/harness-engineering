---
schemaVersion: 1
module: 'packages/core/tests/adoption'
sourceHash: 'f142c0242d216cd6e20058dea7d6489a9b2c8b37df18b67cc3fa9514a4d194e2'
compiledAt: '2026-08-28T01:22:10.684Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['aggregator.test.ts', 'reader.test.ts', 'retrospective.test.ts']
---

## Summary

The `packages/core/tests/adoption` module tests a three-layer skill adoption telemetry system. The reader loads invocation records from `.harness/metrics/adoption.jsonl` with defensive JSONL parsing. The aggregator computes time-series and skill-level summaries (invocation counts, success rates, duration stats, rankings). The retrospective layer analyzes adoption patterns—detecting stale skills, abandoned mid-workflow runs, failure rates, and coverage gaps in the skill catalog. Designed to power telemetry-driven skill development: understand which skills ship/fail, which tools go unused, and render markdown-based adoption retrospectives.

## Invariants

- Success rate counts only 'completed' outcomes; failed/abandoned runs don't contribute to success metrics
- Abandoned-mid-workflow: outcome='abandoned' OR (non-completed AND ≥1 phase reached)—not just failed runs
- JSONL parsing is defensive: malformed lines warn to stderr and skip; valid lines preserved; blank lines silent
- Optional failureCategory field is enum-validated: unrecognized values silently dropped; missing field is back-compat
- Stable sort tiebreaks: when counts tie, sort alphabetically by skill name
- Date and time sorting descends (most recent first); daily aggregation groups by UTC calendar day
- Stale skill detection is threshold-relative: compares (now defaults to latest record) against startedAt + inactivity threshold
- Coverage metrics are catalog-relative: only skills in supplied catalog count toward ever-invoked/never-invoked (non-catalog skills excluded)
- Failure category totals tally at two levels: per-skill on each row + aggregate across all records
- Record window derives from data: min/max startedAt timestamps; windowDays computed from difference

## Interface Contract

```ts

```

## Dependency Slice

```
import { aggregateByDay, aggregateBySkill, topSkills } from '../../src/adoption/aggregator'
import { readAdoptionRecords } from '../../src/adoption/reader'
import { getCatalogRetrospectiveReport, isAbandonedMidWorkflow, renderRetrospectiveMarkdown } from '../../src/adoption/retrospective'
import { SkillInvocationRecord } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
