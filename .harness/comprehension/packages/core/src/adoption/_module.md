---
schemaVersion: 1
module: 'packages/core/src/adoption'
sourceHash: '99b4a66a61023349d5a8666ed7ca46c75ac3f64a2d92e8a8ef96f56b5b764187'
compiledAt: '2026-08-28T01:22:10.265Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['aggregator.ts', 'index.ts', 'reader.ts', 'retrospective.ts']
---

## Summary

The `adoption` module analyzes skill invocation telemetry from `.harness/metrics/adoption.jsonl` to produce adoption metrics and comprehensive retrospective reports. It has four layers: **Reader** parses JSONL records defensively (skips malformed lines with stderr warnings, drops unknown failure categories for back-compat); **Aggregator** bins records by skill or calendar date, sorted by frequency; **Retrospective** builds detailed `RetrospectiveReport` with ranked sections (top-invoked, top-failing, abandoned-mid-workflow, stale-skills), classifies abandonment as either explicit outcome or partial progress then quit, tallies failure categories, and optionally detects catalog coverage; **Rendering** outputs reports as Markdown tables. All aggregations are pure functions that accept explicit "now" timestamps for deterministic output.

## Invariants

- Records read only from .harness/metrics/adoption.jsonl; no fallback locations or configurable paths
- Abandoned-mid-workflow defined as: outcome='abandoned' OR (outcome≠'completed' AND phasesReached.length > 0); both factors must be checked
- startedAt is the authoritative timestamp (ISO 8601); date extraction via slice(0,10) for YYYY-MM-DD; when no explicit 'now' option, latest record's startedAt is used as reference
- Malformed JSONL lines and unknown failureCategory values are silently dropped; never crash, warn to stderr only for structural issues
- All ranked sections (topInvoked, topFailing, abandonedMidWorkflow, staleSkills) capped at topN with deterministic alphabetical tiebreaking on skill name
- Coverage fields (catalogSize, everInvoked, neverInvoked) are null when catalogSkills option not provided; retrospective still renders with partial context
- Empty ranked sections render gracefully with context-appropriate notes; no error for zero failures, zero abandonments, or zero stale skills
- Failure category tallies are aggregate-only (global and per-skill); unknown categories already filtered at parse time, so all keys in failureCategories map are valid
- Window timestamps (windowStart, windowEnd) are min/max of all record startedAt values; windowDays is whole-day delta, never negative

## Interface Contract

```ts
export DailyAdoption
export RetrospectiveCoverage
export RetrospectiveOptions
export RetrospectiveReport
export SkillRetroStat
export aggregateByDay
export aggregateBySkill
export getCatalogRetrospectiveReport
export isAbandonedMidWorkflow
export readAdoptionRecords
export renderRetrospectiveMarkdown
export topSkills
```

## Dependency Slice

```
import { FAILURE_CATEGORIES, SkillAdoptionSummary, SkillInvocationRecord } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
