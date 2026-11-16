---
schemaVersion: 1
module: 'tests/scripts'
sourceHash: 'ea0a1e7d366bba87c081b51300aa0aa6d131fbf30d2c41675d224c509be11a90'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'assert-vitest-ran.test.mjs',
    'audit-exceptions.test.mjs',
    'baseline-gating.test.mjs',
    'check-changesets.test.mjs',
    'coverage-ratchet-floor.test.mjs',
    'design-capture.test.mjs',
    'ensure-node-pin.test.mjs',
    'generate-barrel-exports.test.ts',
    'generate-docs-determinism.test.ts',
    'main-health-check.test.mjs',
    'plugin-antigravity-target.test.mjs',
    'plugin-pin-sync.test.mjs',
    'precommit-plugin-stage.test.mjs',
    'prepush-tag-only.test.mjs',
    'release-publish.test.mjs',
    'test-runner-split.test.mjs',
    'workflow-merge-race.test.mjs',
    'workflow-token-permissions.test.mjs',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { EXIT, assessVitestLog, stripAnsi } from '../../scripts/assert-vitest-ran.mjs'
import { extractAdvisories, lapseReason, reconcile } from '../../scripts/audit-exceptions.mjs'
import { mergeBenchmarkBaselines } from '../../scripts/benchmark-check.mjs'
import { parseChangesetFrontmatter } from '../../scripts/check-changesets.mjs'
import { EXIT, evaluateCoverage, inScopeFromTurboDryRun, mergeCoverageBaselines, pruneCoverageSummaries, ratchetVerdict, toleranceFor } from '../../scripts/coverage-ratchet.mjs'
import { baseUrl, pageFiles, parseTargetFiles, slugForFile } from '../../scripts/design-capture.mjs'
import { PLUGIN_CONFIGS, getConfig } from '../../scripts/lib/plugin-config.mjs'
import { ALARM_LABEL, ALARM_MARKER, EXIT, decideAction, deliverAlarm, evaluateHealth, fetchRuns, findOpenAlarmIssue, renderIssueBody, renderSummary, selectDecisiveRuns } from '../../scripts/main-health-check.mjs'
import { classifyPublish, parsePublishOutput, registryUrl, runRelease, waitForVisibility } from '../../scripts/release-publish.mjs'
import { MANIFEST_PATHS, findPinnedVersion, readCliVersion, syncManifestContent } from '../../scripts/sync-plugin-pin.mjs'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseYaml } from 'yaml'
```
