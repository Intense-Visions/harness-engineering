---
schemaVersion: 1
module: 'packages/cli/tests/ci'
sourceHash: '24ab9d968a2d8e63c4e97a3bbf3cefb8f28a1b6bb7a70daac6df06d80357d4f4'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'baseline-diff-guard.test.ts',
    'check.test.ts',
    'diff-scope-guard.test.ts',
    'harness-cache-ignore.test.ts',
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
