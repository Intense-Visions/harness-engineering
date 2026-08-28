---
schemaVersion: 1
module: 'packages/cli/src/design-craft/measurement'
sourceHash: '3dd11bd19602f9830f333a8cd8f0048e77b467d4ddbf0a6d59cf4b63f01f78b8'
compiledAt: '2026-08-28T01:22:09.090Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'signal.ts', 'usage.ts']
---

## Summary

The **design-craft measurement module** is the "growth infrastructure" half of ADR 0020 (living-catalog H pattern). It instruments the catalog with two feedback loops:

**Signal loop** (`signal.ts`): Detects recurring design findings across projects. When the same finding shape (code + tier + rubric/pattern ID) fires ≥5 times across ≥2 distinct projects, the module materializes a candidate proposal YAML for human review—this is how operational signals become new rubrics or patterns. Events are JSONL-appended (never blocking a CRITIQUE run), and proposals are generated on-demand via `proposeFromRecurringFindings()`.

**Usage tracking** (`usage.ts`): Counts how often catalog items are invoked or applied—which rubrics trigger most, which patterns suggest successfully, which exemplars get cited. A JSON counter file lives at `.harness/design-craft/usage.json` (per-project, gitignorable). Counters feed dashboards and APIs to steer catalog evolution toward what actually works.

Together: the catalog seeds from human contributions (PR-time) and grows from what the system observes in use. No LLM or network I/O—pure instrumentation.

## Invariants

- Fingerprint includes tier — same code can be flagged at different tiers (polish vs. foundational). Tier membership keeps 'this sometimes fires at both levels' from masking a real architectural pattern that's always foundational.
- Multi-project recurrence guard — proposals only materialize when ≥2 distinct projects exhibit the same finding shape. Single-project bugs never become signals; this prevents catalog pollution from local pathologies.
- Signal I/O is best-effort — recordSignalEvent() swallows all filesystem errors. Recording findings must never fail a CRITIQUE or POLISH phase.
- JSONL append never blocks — events are appended (fire-and-forget); proposal aggregation is deferred to an explicit proposeFromRecurringFindings() call. Fast phases stay fast.
- Proposal generation is idempotent — re-running produces the same file; counts refresh in place. Safe to run multiple times against the same event log.
- Usage counter RMW is single-process safe — read-modify-write model works for the CLI. Multi-process scenarios are out of scope for MVP.
- Stats are immutable snapshots — getCatalogStats() returns a point-in-time view for APIs; counters file is the source of truth for subsequent reads.

## Interface Contract

```ts
export CatalogStats
export CatalogUsageCounters
export ProposalCandidate
export SignalEvent
export getCatalogStats
export proposeFromRecurringFindings
export recordApply
export recordCite
export recordSignalEvent
export recordTrigger
export resetCatalogStats
export resetSignalStore
```

## Dependency Slice

```
import { CraftFinding } from '../findings/schema.js'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
