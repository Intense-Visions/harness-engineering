---
schemaVersion: 1
module: "tests/scripts"
sourceHash: "842da0e3ac44a944b01f38b7ce5163d787d0a73c0ec0d9ac11872b395ed54e83"
compiledAt: "2026-08-28T01:22:12.877Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["audit-exceptions.test.mjs", "baseline-gating.test.mjs", "check-changesets.test.mjs", "design-capture.test.mjs", "ensure-node-pin.test.mjs", "generate-barrel-exports.test.ts", "generate-docs-determinism.test.ts", "main-health-check.test.mjs", "plugin-antigravity-target.test.mjs", "plugin-pin-sync.test.mjs"]
---

## Summary

This test directory validates the pure logic of the CI/pre-push gate orchestration layer. It covers three critical gates: (1) advisory reconciliation — every npm audit advisory must be covered by a register entry with an unexpired timestamp, fail-closed on missing `expires`; (2) baseline jitter tolerance — coverage and benchmark baselines update only when movement exceeds tolerance (0.5%), so sub-tolerance jitter produces byte-identical files and prevents noise-only refresh-PR conflicts; (3) stale-file cleanup — pruneCoverageSummaries deletes stale coverage summaries before turbo affected runs so "measured this run ⟺ file present" holds and allowMissing skips unaffected packages without false regressions.

## Invariants

- Every active advisory ID must have a covering register entry; missing or absent expires field must fail reconcile, never pass (fail-closed)
- An expires date is valid through end-of-day UTC on that date; lapses at midnight the next day (2026-08-15 expires through 2026-08-15T23:59:59Z, lapses at 2026-08-16T00:00:00Z)
- When baseline measurements drift within tolerance, mergeCoverageBaselines and mergeBenchmarkBaselines must return JSON-identical output to the committed baseline (enables git diff --cached --quiet gate)
- Stale coverage summaries must be deleted by pruneCoverageSummaries before the affected run so that 'measured this run ⟺ file present' holds and allowMissing correctly skips unaffected packages

## Interface Contract

```ts

```

## Dependency Slice

```
import { extractAdvisories, lapseReason, reconcile } from '../../scripts/audit-exceptions.mjs'
import { mergeBenchmarkBaselines } from '../../scripts/benchmark-check.mjs'
import { parseChangesetFrontmatter } from '../../scripts/check-changesets.mjs'
import { evaluateCoverage, mergeCoverageBaselines, pruneCoverageSummaries } from '../../scripts/coverage-ratchet.mjs'
import { baseUrl, pageFiles, parseTargetFiles, slugForFile } from '../../scripts/design-capture.mjs'
import { getConfig } from '../../scripts/lib/plugin-config.mjs'
import { ALARM_LABEL, ALARM_MARKER, EXIT, decideAction, deliverAlarm, evaluateHealth, fetchRuns, findOpenAlarmIssue, renderIssueBody, renderSummary, selectDecisiveRuns } from '../../scripts/main-health-check.mjs'
import { MANIFEST_PATHS, findPinnedVersion, readCliVersion, syncManifestContent } from '../../scripts/sync-plugin-pin.mjs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
