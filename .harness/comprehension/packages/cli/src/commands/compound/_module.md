---
schemaVersion: 1
module: 'packages/cli/src/commands/compound'
sourceHash: '32d9b436fb3bbcf221644e70cf4221997b6533d1c270e28e198d8f0fa8ff374c'
compiledAt: '2026-08-28T01:22:08.774Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'scan-candidates.ts']
---

## Summary

`packages/cli/src/commands/compound` provides a `harness compound` command group for post-mortem analysis. Currently it hosts a single `scan-candidates` subcommand that scans recent git commits (default 7 days) for undocumented fixes and high-churn code hotspots, cross-references them against a solutions directory, and writes a markdown report to `docs/solutions/.candidates/{YYYY-WW}.md`. The command outputs status as human-friendly text (interactive mode) or single-line JSON (non-interactive/non-TTY). It is scaffolded for future subcommands like `migrate-learnings`.

## Invariants

- Hotspot threshold is hardcoded to 7 — files must churn ≥7 times to qualify as candidate hotspots
- Default lookback window is 7 days unless explicitly overridden via --lookback flag
- Non-interactive mode is triggered by explicit --non-interactive flag OR non-TTY stdout (either gate enables JSON output)
- Candidate count is the sum of undocumented fixes + hotspots; report is empty only if both scans return zero results
- Output path defaults to week-keyed location {YYYY-WW}.md under docs/solutions/.candidates/; derived from ISO week of scan time, not CLI input
- Exit code 1 is set only on scan/assembly failures, enabling shell error handling
- ISO week is always 'now' — report timestamp comes from new Date() at run time; one report per calendar week

## Interface Contract

```ts
export createCompoundCommand
```

## Dependency Slice

```
import { createScanCandidatesCommand } from './scan-candidates'
import { assembleCandidateReport, computeHotspots, crossReferenceUndocumentedFixes, formatIsoWeek, gitScan, isoWeek } from '@harness-engineering/core'
import { Command } from 'commander'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
```
