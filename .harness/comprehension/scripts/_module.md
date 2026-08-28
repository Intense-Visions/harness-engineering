---
schemaVersion: 1
module: "scripts"
sourceHash: "ad59d9cb702e309b1b8a7842e900a07a68ed5ceea7a014a75bbaf2821c070267"
compiledAt: "2026-08-28T01:22:12.847Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["assert-baseline-only-diff.mjs", "assert-diff-scope.mjs", "audit-exceptions.mjs", "benchmark-check.mjs", "check-changesets.mjs", "clean.mjs", "coverage-ratchet.mjs", "design-capture.mjs", "generate-agent-setup-prompt.mjs", "generate-barrel-exports.mjs", "generate-core-barrel.mjs", "generate-docs.mjs", "generate-persona-workflows.mjs", "generate-plugin.mjs", "generate-tool-catalog.mjs", "main-health-check.mjs", "refresh-model-candidates.mjs", "summarize-test-failures.mjs", "sync-lockfile.mjs", "sync-plugin-pin.mjs", "vitest-prepush-reporter.mjs"]
---

## Summary

The `scripts` module is a collection of Node.js CLI tools that enforce CI/CD guardrails and pre-push validations. It comprises three primary guard scripts that refuse to self-approve PRs when their diffs violate scope boundaries or baseline contracts, plus utilities for audit-exception reconciliation, coverage baseline management, manifest syncing, and run-result reporting. The module is load-bearing infrastructure for the harness' pre-push gate pipeline and PR self-approval workflows—it determines what code is allowed to land by validating diff scope, refusing permanent audit exemptions, and catching baseline drift.

## Invariants

- Baseline-only diff guard: A PR changing BASELINE_FILES must touch only files in the allowlist; any off-list change causes immediate rejection and blocks self-approval.
- Audit exceptions are time-boxed: Every active advisory in pnpm audit must have a matching auditExceptions entry with a valid, non-lapsed expires date (ISO format, inclusive of its whole UTC day); missing or malformed expires is treated as already lapsed—fail closed.
- Diff-scope guards use patterns, not globs: Paths ending in / match directory prefixes; others match exact file paths. A PR can only touch files matching at least one allowed pattern—off-pattern changes trigger rejection.
- Shell-aware argument parsing: Allowlists and patterns come as either separate shell-split args (bash) or one whitespace-joined string (zsh/others). Both must parse identically to the same set; guards split on \s+ to handle both cases uniformly.
- Fail-closed validation: Missing data (no allowlist, no expires, invalid JSON, empty diff), malformed inputs, and network errors all cause process exit 1, never silent pass-through.
- Stale register entries are warnings, not failures: Audit exceptions that no longer match active advisories are reported for hygiene cleanup but do not block compliance checks.

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
