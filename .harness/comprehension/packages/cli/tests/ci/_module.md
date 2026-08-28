---
schemaVersion: 1
module: 'packages/cli/tests/ci'
sourceHash: 'ab0bb1d23d9bedfeecf40711fb2c7aaee7173cd7c0a99d4f6d45c6de578f33be'
compiledAt: '2026-08-28T01:22:09.600Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'baseline-diff-guard.test.ts',
    'check.test.ts',
    'diff-scope-guard.test.ts',
    'init.test.ts',
    'notify.test.ts',
    'roadmap-auto-done-workflow.test.ts',
    'summarize-test-failures.test.ts',
    'vitest-prepush-reporter.test.ts',
  ]
---

## Summary

**`packages/cli/tests/ci`** validates the CI infrastructure ecosystem: PR diff scoping guards, CI check command routing, workflow automation, and test failure reporting. The module tests baseline governance (self-approval guards ensure PRs changing only baseline snapshots are auto-approved with scope validation before approval), CI check command (wraps `@harness-engineering/core`'s check runner with option parsing, config resolution, and multi-format output), CI config generation (template system for GitHub Actions, GitLab CI, and shell scripts with language-aware setup), scope guards (exact-path and directory-prefix matching to validate PR diff scope), roadmap automation (GitHub workflow marks roadmap items done on PR merge with rebase-retry push and closing-issue detection), and test failure reporting (Vitest JSON report parsing and summarization for pre-push gates).

## Invariants

- Baseline PRs fail closed — Empty diffs and files outside the allowlist are rejected before self-approval; protects against phantom PRs and drift
- Scope guards run before approval — assert-baseline-only-diff.mjs executes before gh pr review in the CI workflow; approval without scope validation is a security hole
- Allowance dirs are transient — Per-PR allowance files are deleted after merge; they never accumulate on main
- Exact matching, not globs — Bare baselines.json must pass; a \*-baselines.json glob would wrongly reject them
- Stage validation at parse time — Unrecognized --stage values reject immediately with ExitCode.ERROR; silently running all stages is a footgun
- Roadmap-auto-done gates on merged — Workflow checks github.event.pull_request.merged == true; running on closed-but-unmerged PRs flips roadmap state incorrectly
- Rebase with hard-reset retry — Direct push retries fetch + rebase + push with git reset --hard between attempts; absorbs concurrent merges without leaving dirty trees
- Test reports gracefully degrade — Missing packages dir returns [], not an error; reporter JSON output only activates on exact HARNESS_PREPUSH=1

## Interface Contract

```ts

```

## Dependency Slice

```
import { assertBaselineOnly } from '../../../../scripts/lib/baseline-diff-guard.mjs'
import { assertDiffScope } from '../../../../scripts/lib/diff-scope-guard.mjs'
import { extractFailures, findReportPaths, formatSummary } from '../../../../scripts/summarize-test-failures.mjs'
import { prepushTestOptions } from '../../../../scripts/vitest-prepush-reporter.mjs'
import { createCheckCommand, runCICheck } from '../../src/commands/ci/check'
import { createInitCommand, generateCIConfig } from '../../src/commands/ci/init'
import { createNotifyCommand } from '../../src/commands/ci/notify'
import { resolveConfig } from '../../src/config/loader'
import { ExitCode } from '../../src/utils/errors'
import { runCIChecks } from '@harness-engineering/core'
import * as fs, { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
```
