---
schemaVersion: 1
module: 'packages/core/tests/ci'
sourceHash: 'a9ed09e141975f868b8a588e085df0b800d2bf4ed82b4d7f9c558173812b89a9'
compiledAt: '2026-08-28T01:22:10.761Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'base-freshness.behavior.test.ts',
    'check-orchestrator.test.ts',
    'constraint-packs-orchestrator.test.ts',
    'constraint-packs-real-scanner.test.ts',
    'notifier.test.ts',
    'report-formatter.test.ts',
  ]
---

## Summary

packages/core/tests/ci validates the CI gate orchestration and reporting layer. It tests three components: (1) base-freshness classification (whether a test result's base SHA is trustworthy for merge by detecting if main has advanced), (2) check orchestration (running 9 gates in deterministic order: validate, deps, docs, entropy, security, perf, phase-gate, arch, traceability, mostly in parallel but always outputting in canonical order), and (3) constraint-pack wiring (overlaying security policy on base config). Tests exercise pass/fail/skip paths, exit-code semantics, and mock all heavyweight I/O (fs, glob, subprocess scanners) while running orchestrator logic live.

## Invariants

- Base freshness trust model: when strictRequired=true OR base SHA hasn't advanced since test, verdict is trust='verified'; when strictRequired=false AND base advanced, downgrade to trust='degraded'. The reason field must include short (7-char) SHAs of both tested and current base for drift reporting.
- Check execution order is canonical: output always reflects [validate, deps, docs, entropy, security, perf, phase-gate, arch, traceability] regardless of parallel completion; skipped checks do not reorder.
- Exit code is deterministic: exitCode=0 iff all non-skipped checks pass; exitCode=1 if any check fails OR warnings exist when failOn='warning'.
- Check report uniformity: every check produces {name, status, durationMs, reason, …} regardless of type; status ∈ {pass|fail|skip}; duration is recorded for all non-skipped checks.
- Constraint-pack overlay is composable: security checks receive base config + constraint-pack overlay; overlay augments (not replaces) base config; overlay properties are observable on the config object passed to the check.
- Mock orchestration is hermetic: all heavyweight I/O (glob, scanners, fs) is mocked; only orchestrator control-flow logic runs live to verify check ordering and aggregation.

## Interface Contract

```ts

```

## Dependency Slice

```
import { classifyBaseFreshness } from '../../src/ci/base-freshness'
import { runCIChecks } from '../../src/ci/check-orchestrator'
import { CINotifier } from '../../src/ci/notifier'
import { formatCIReportAsMarkdown } from '../../src/ci/report-formatter'
import from '../../src/context/agents-map'
import from '../../src/context/doc-coverage'
import { TrackerSyncAdapter } from '../../src/roadmap/tracker-sync'
import { CICheckName, CICheckReport, Err, Ok } from '@harness-engineering/types'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
