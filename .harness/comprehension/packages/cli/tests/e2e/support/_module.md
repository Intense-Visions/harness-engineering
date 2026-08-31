---
schemaVersion: 1
module: 'packages/cli/tests/e2e/support'
sourceHash: 'd754897f9c8250e8994e15d4e292941a9bc62a0f2c766da3a7db67935a232934'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['fake-provider.ts', 'fixtures.ts', 'harness-cli.ts', 'index.ts', 'temp-project.ts', 'tiers.ts']
---

## Interface Contract

```ts
export *
```

## Dependency Slice

```
import { ClaudeEnvelope } from './fixtures'
import { HAS_HARNESS_BIN } from './harness-cli'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
```
