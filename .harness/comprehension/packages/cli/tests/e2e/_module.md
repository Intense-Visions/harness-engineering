---
schemaVersion: 1
module: 'packages/cli/tests/e2e'
sourceHash: 'b92d54765b7f4c75108a03860fa13ba7c4e5d8a91e773de8771f16c0c2632da1'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['cli-smoke.e2e.test.ts', 'comprehend-boundary.e2e.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { cleanup, fakeProviderEnv, initGitRepo, loadClaudeEnvelope, removeFakeClaude, runHarness, scaffoldProject, skipTierB, skipUnlessBin, skipUnlessBinPosix, withFakeClaude } from './support'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
```
