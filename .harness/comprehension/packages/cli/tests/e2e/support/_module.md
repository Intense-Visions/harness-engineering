---
schemaVersion: 1
module: 'packages/cli/tests/e2e/support'
sourceHash: '9ba58ebc16e162bfc57504fa086cd909a5b6a0bb7f0550d03b89087ab27dc092'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'fake-provider.ts',
    'fixtures.ts',
    'harness-cli.test.ts',
    'harness-cli.ts',
    'index.ts',
    'temp-project.ts',
    'tiers.ts',
  ]
---

## Interface Contract

```ts
export *
```

## Dependency Slice

```
import { ClaudeEnvelope } from './fixtures'
import { HAS_HARNESS_BIN, runHarness } from './harness-cli'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import * as os from 'node:os'
import path, * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
```
