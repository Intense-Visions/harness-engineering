---
schemaVersion: 1
module: 'scripts'
sourceHash: 'fc6f26752b4dcb763408afcc280014f80e1c4569935a95aab1a5abb36e3c8790'
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
export EXIT
export MANIFEST_PATHS
export baseUrl
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
export parseTargetFiles
export prepushTestOptions
export pruneCoverageSummaries
export readCliVersion
export reconcile
export renderIssueBody
export renderSummary
export selectDecisiveRuns
export slugForFile
export syncManifestContent
export syncPluginPins
```

## Dependency Slice

```
import { assertBaselineOnly } from './lib/baseline-diff-guard.mjs'
import { assertDiffScope } from './lib/diff-scope-guard.mjs'
import { STANDARD_HOOKS, getConfig } from './lib/plugin-config.mjs'
import { execFileSync, execSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path, { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import from 'playwright'
import { parseYaml } from 'yaml'
```
