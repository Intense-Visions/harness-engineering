---
schemaVersion: 1
module: 'packages/intelligence/src/adapters'
sourceHash: '65a608bdd779b32b0c5d4dabb44d79006e711992e4599cf39666d8bba49a3a0c'
compiledAt: '2026-08-28T01:22:11.828Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['canary.ts', 'github.ts', 'index.ts', 'jira.ts', 'linear.ts', 'manual.ts']
---

## Summary

The `adapters` module is a translation layer that converts work items and test metadata from external sources into a canonical internal model. It has two primary responsibilities:

**Work Item Converters** normalize issues/PRs from GitHub, Jira, Linear, or manual input into a `RawWorkItem` shape. Each converter accepts pre-fetched API data and flattens it into a consistent structure with `id`, `title`, `description`, `labels`, `metadata` (source-specific fields), `linkedItems`, `comments`, and `source` tag.

**Canary Test Adapter** is a graceful, total wrapper around the optional `canary` test CLI. It never throws: all operations resolve to degraded/empty results on missing CLI, malformed output, or timeouts. The adapter provides framework recommendations, test review findings, framework registry queries, and run-history artifact reading. All Canary coupling is confined to this module (enforced by a boundary test). Supporting schemas validate Canary output permissively using `.passthrough()` and loose string types so schema drift never hard-fails records.

## Invariants

- Canary coupling is hermetic — all `canary` / `canary-test-cli` references live in `canary.ts` and are never re-exported from `index.ts`; a boundary test enforces this.
- Canary adapter never throws — every method (probe, recommendFramework, reviewTest, listFrameworks, readRunHistory) degrades gracefully when the CLI is missing, broken, or times out (30s).
- Work-item converters accept only pre-fetched data — they assume the caller has already fetched and shaped the raw API response; converters perform no I/O or API calls.
- RawWorkItem is the canonical shape — all five converters output the same structure; downstream code consumes only RawWorkItem, never the source-specific types.
- Canary schemas are intentionally permissive — string enums (not z.enum), .passthrough(), optional fields, and default arrays ensure one unmodeled output field never silently drops an entire record.
- Exec and reader are testable seams — CanaryExec and CanaryReader are injected interfaces; tests provide fakes to control CLI availability and artifact contents without touching the real system.
- Canary degradation is classified — four distinct reasons (not-installed, binary-missing, exec-failed, bad-output) allow callers to decide retry policy; no generic error bucket.

## Interface Contract

```ts
export CanaryAdapter
export CanaryDegradeReason
export CanaryExec
export CanaryFinding
export CanaryFrameworkInfo
export CanaryProbe
export CanaryReader
export CanaryRunRecord
export CanaryTestResult
export FrameworkRecommendation
export GitHubComment
export GitHubIssue
export GitHubLabel
export JiraComment
export JiraIssue
export JiraIssueLink
export LinearComment
export LinearIssue
export LinearLabel
export LinearRelation
export ManualInput
export canaryRunRecordSchema
export canaryTestResultSchema
export createCanaryAdapter
export githubToRawWorkItem
export jiraToRawWorkItem
export linearToRawWorkItem
export manualToRawWorkItem
export resolveTestCommand
```

## Dependency Slice

```
import { RawWorkItem } from '../types.js'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import * as nodePath from 'node:path'
import { z } from 'zod'
```
