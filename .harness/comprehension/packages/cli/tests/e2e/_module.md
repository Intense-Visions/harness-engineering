---
schemaVersion: 1
module: 'packages/cli/tests/e2e'
sourceHash: '1e69f507cfe5d11c03d196e779dc2e18ea106d623211a3ff6cbe828a39077782'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'autonomy-env-lower-only.e2e.test.ts',
    'cli-smoke.e2e.test.ts',
    'comprehend-boundary.e2e.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { cleanup, fakeProviderEnv, initGitRepo, loadClaudeEnvelope, removeFakeClaude, runHarness, scaffoldProject, skipTierB, skipUnlessBin, skipUnlessBinPosix, withFakeClaude } from './support'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import * as os from 'node:os'
import path, * as path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
```
