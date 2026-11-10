---
schemaVersion: 1
module: 'packages/cli/tests/e2e/support'
sourceHash: '41e33138c5d4f47e5381b75f45cd625d6c9f9514127fba7ca3578970340ee72e'
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
