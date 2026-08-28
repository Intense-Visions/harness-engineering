---
schemaVersion: 1
module: 'packages/cli/tests/ci'
sourceHash: 'ab0bb1d23d9bedfeecf40711fb2c7aaee7173cd7c0a99d4f6d45c6de578f33be'
compiledAt: '2026-08-28T01:22:09.600Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
