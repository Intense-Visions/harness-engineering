---
schemaVersion: 1
module: 'packages/cli/tests/e2e'
sourceHash: '7c981e2312c350470b39eb5a535b847ee435cf0c988bf13a76407c15d8007e9d'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'autonomy-env-lower-only.e2e.test.ts',
    'cli-smoke.e2e.test.ts',
    'comprehend-boundary.e2e.test.ts',
    'json-stdout-clean.e2e.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { HARNESS_BIN, cleanup, fakeProviderEnv, initGitRepo, loadClaudeEnvelope, removeFakeClaude, runHarness, scaffoldProject, skipTierB, skipUnlessBin, skipUnlessBinPosix, withFakeClaude } from './support'
import { execFileSync, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import * as os from 'node:os'
import path, * as path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
```
