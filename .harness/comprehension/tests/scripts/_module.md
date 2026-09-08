---
schemaVersion: 1
module: 'tests/scripts'
sourceHash: 'f5f1dd0f1f898df82f626a27a512ee2615e9c61d47fea2d667f80c0f92c3062e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'audit-exceptions.test.mjs',
    'baseline-gating.test.mjs',
    'check-changesets.test.mjs',
    'design-capture.test.mjs',
    'ensure-node-pin.test.mjs',
    'generate-barrel-exports.test.ts',
    'generate-docs-determinism.test.ts',
    'main-health-check.test.mjs',
    'plugin-antigravity-target.test.mjs',
    'plugin-pin-sync.test.mjs',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { extractAdvisories, lapseReason, reconcile } from '../../scripts/audit-exceptions.mjs'
import { mergeBenchmarkBaselines } from '../../scripts/benchmark-check.mjs'
import { parseChangesetFrontmatter } from '../../scripts/check-changesets.mjs'
import { evaluateCoverage, mergeCoverageBaselines, pruneCoverageSummaries, toleranceFor } from '../../scripts/coverage-ratchet.mjs'
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
