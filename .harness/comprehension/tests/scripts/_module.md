---
schemaVersion: 1
module: 'tests/scripts'
sourceHash: '6daab0b32e3a685335d8f21471d373fc7338ceb6987cc45d7e3c7f868cf06a51'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'arch-snapshot-fold.test.mjs',
    'assert-vitest-ran.test.mjs',
    'audit-exceptions.test.mjs',
    'baseline-gating.test.mjs',
    'check-changesets.test.mjs',
    'core-public-symbols.test.mjs',
    'coverage-ratchet-floor.test.mjs',
    'design-capture.test.mjs',
    'dockerfile-deps-workspace-coverage.test.mjs',
    'ensure-node-pin.test.mjs',
    'generate-barrel-exports.test.ts',
    'generate-docs-determinism.test.ts',
    'main-health-check.test.mjs',
    'override-floors.test.mjs',
    'persona-workflow-paths.test.mjs',
    'plugin-antigravity-target.test.mjs',
    'plugin-pin-sync.test.mjs',
    'precommit-plugin-stage.test.mjs',
    'prepush-tag-only.test.mjs',
    'release-pr-ci-signal.test.mjs',
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
import { classifyLockfiles, extractAdvisories, extractNpmAdvisories, lapseReason, reconcile } from '../../scripts/audit-exceptions.mjs'
import { mergeBenchmarkBaselines } from '../../scripts/benchmark-check.mjs'
import { parseChangesetFrontmatter } from '../../scripts/check-changesets.mjs'
import { EXIT, evaluateCoverage, inScopeFromTurboDryRun, mergeCoverageBaselines, pruneCoverageSummaries, ratchetVerdict, toleranceFor } from '../../scripts/coverage-ratchet.mjs'
import { baseUrl, pageFiles, parseTargetFiles, slugForFile } from '../../scripts/design-capture.mjs'
import { computePublicSymbols, diffSymbols, parseManifest, renderManifest } from '../../scripts/lib/core-public-symbols.mjs'
import { PLUGIN_CONFIGS, getConfig } from '../../scripts/lib/plugin-config.mjs'
import { ALARM_LABEL, ALARM_MARKER, EXIT, decideAction, deliverAlarm, evaluateHealth, fetchRuns, findOpenAlarmIssue, renderIssueBody, renderSummary, selectDecisiveRuns } from '../../scripts/main-health-check.mjs'
import { mergeTimelines } from '../../scripts/merge-arch-timeline.mjs'
import { checkFloors, findAdvancements, parseLockfile, parseOverrideKey, satisfies } from '../../scripts/override-floors.mjs'
import { classifyPublish, parsePublishOutput, registryUrl, runRelease, waitForVisibility } from '../../scripts/release-publish.mjs'
import { MANIFEST_PATHS, findPinnedVersion, readCliVersion, syncManifestContent } from '../../scripts/sync-plugin-pin.mjs'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse, parseYaml } from 'yaml'
```
