---
schemaVersion: 1
module: 'packages/cli/tests/e2e'
sourceHash: 'b304d0bf49491f4f372461a926a581e27273bd0d5f121c644ea23b6949b5c765'
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
