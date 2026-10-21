---
schemaVersion: 1
module: 'scripts'
sourceHash: '313f696750c4caf66dd1687cd7d4eeb297f26e9e7127c13ddd299e3258841a29'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'assert-baseline-only-diff.mjs',
    'assert-diff-scope.mjs',
    'audit-exceptions.mjs',
    'benchmark-check.mjs',
    'check-changesets.mjs',
    'clean.mjs',
    'coverage-ratchet.mjs',
    'design-capture.mjs',
    'generate-agent-setup-prompt.mjs',
    'generate-barrel-exports.mjs',
    'generate-core-barrel.mjs',
    'generate-docs.mjs',
    'generate-persona-workflows.mjs',
    'generate-plugin.mjs',
    'generate-tool-catalog.mjs',
    'main-health-check.mjs',
    'refresh-model-candidates.mjs',
    'release-publish.mjs',
    'summarize-test-failures.mjs',
    'sync-lockfile.mjs',
    'sync-plugin-pin.mjs',
    'vitest-prepush-reporter.mjs',
  ]
---

## Interface Contract

```ts
export ALARM_LABEL
export ALARM_MARKER
export DEFAULT_VERIFY_INTERVAL_MS
export DEFAULT_VERIFY_TIMEOUT_MS
export EXIT
export MANIFEST_PATHS
export REGISTRY_BASE
export baseUrl
export classifyPublish
export decideAction
export deliverAlarm
export evaluateCoverage
export evaluateHealth
export extractAdvisories
export extractFailures
export fetchRuns
export findOpenAlarmIssue
export findPinnedVersion
export findReportPaths
export formatSummary
export lapseReason
export main
export mergeBenchmarkBaselines
export mergeCoverageBaselines
export pageFiles
export parseChangesetFrontmatter
export parsePublishOutput
export parseTargetFiles
export prepushTestOptions
export pruneCoverageSummaries
export readCliVersion
export reconcile
export registryUrl
export renderIssueBody
export renderSummary
export runRelease
export selectDecisiveRuns
export slugForFile
export specKey
export stripAnsi
export syncManifestContent
export syncPluginPins
export toleranceFor
export waitForVisibility
```

## Dependency Slice

```
import { assertBaselineOnly } from './lib/baseline-diff-guard.mjs'
import { assertDiffScope } from './lib/diff-scope-guard.mjs'
import { STANDARD_HOOKS, getConfig } from './lib/plugin-config.mjs'
import { execFileSync, execSync, spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path, { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import from 'playwright'
import { parseYaml } from 'yaml'
```
