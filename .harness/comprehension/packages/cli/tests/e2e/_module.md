---
schemaVersion: 1
module: 'packages/cli/tests/e2e'
sourceHash: '160f0a1a398e4f88ff9e8a24d8d221e28386eaa2e84d0d1bf2dbc0078fcd2577'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'autonomy-env-lower-only.e2e.test.ts',
    'cli-smoke.e2e.test.ts',
    'comprehend-boundary.e2e.test.ts',
    'json-output-contract.e2e.test.ts',
    'json-stdout-clean.e2e.test.ts',
    'json-stdout-pipe.e2e.test.ts',
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
