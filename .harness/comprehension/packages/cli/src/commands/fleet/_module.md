---
schemaVersion: 1
module: 'packages/cli/src/commands/fleet'
sourceHash: '45b22172671b43a840084c279410a687d073620c9e8abbe4beaa22a424fb424f'
compiledAt: '2026-08-28T01:22:08.796Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['budget-check.test.ts', 'budget-check.ts', 'index.ts']
---

## Summary

`packages/cli/src/commands/fleet` is a two-tier CLI module that gates lane dispatch with spend budget checks. It wraps the burn HUD's cost tracking into an enforceable gate for the fleet-command DISPATCH contract (#1600). Before the fleet-family skill schedules each lane, it calls `harness fleet budget-check` to compare observed week-to-date spend (from burn's per-skill attribution) against a configurable envelope. The command emits one of three verdicts—`unconfigured` (no-op), `within` (safe to proceed), or `exhausted` (budget spent)—and exits with a special code (10) on exhaustion so the caller can branch on "budget spent" vs. command error. The core logic reads burn's summary, parses human-friendly envelope units (250M, 1.2B), invokes the shared `evaluateSpendEnvelope` primitive, and optionally overlays USD costs when a burn price table is configured.

## Invariants

- Never fake green from missing data — when no burn summary exists, spend floors to zero; a failed rescan must not mask the verdict
- Exit codes are prescriptive — BUDGET_EXHAUSTED_EXIT_CODE=10 for exhausted (distinct from 1/2 command errors); 0 for within/unconfigured; fleet dispatch routes on this
- Spend envelopes are optional — absent --envelope flag ⇒ unconfigured no-op; returns 0 (unbounded dispatch)
- Per-fleet keys must match burn attribution — tries bare name, harness: prefix, and prefixless variants to resolve --fleet against burn's skills block
- Tokens are truth, dollars are derived — cost overlay comes from burn's price table reconciliation (#1522/#1525); if unpriced models exist, flags it but doesn't fail
- JSON and human output are byte-identical without cost data — when no price table is configured, cost key is omitted entirely; callers can safely parse both formats
- One implementation, two governed paths — uses the same evaluateSpendEnvelope as the orchestrator, ensuring consistent budget logic across dispatch and execution

## Interface Contract

```ts
export createFleetCommand
```

## Dependency Slice

```
import { BUDGET_EXHAUSTED_EXIT_CODE, createBudgetCheckCommand, envelopeFromOptions, observedSpendFromSummary, runBudgetCheck } from './budget-check'
import { Summary, human, readSummary, refresh, resolvePaths } from '@harness-engineering/burn'
import { evaluateSpendEnvelope } from '@harness-engineering/core'
import { ObservedSpend, SpendEnvelope, SpendEnvelopeVerdict } from '@harness-engineering/types'
import chalk from 'chalk'
import { Command } from 'commander'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
```
