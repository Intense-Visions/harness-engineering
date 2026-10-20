---
schemaVersion: 1
module: 'packages/cli/tests/ci'
sourceHash: 'f4993eb705b1a4b616995a613f94d7f5c18f6bbb23306c6f95a44297cf47c8d1'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'baseline-diff-guard.test.ts',
    'check.test.ts',
    'diff-scope-guard.test.ts',
    'harness-metrics-ignore.test.ts',
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
import { resolveProjectFrom } from '../helpers/resolve-project-mock'
import { runCIChecks } from '@harness-engineering/core'
import { spawnSync } from 'node:child_process'
import * as fs, { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import YAML, { parse } from 'yaml'
```
