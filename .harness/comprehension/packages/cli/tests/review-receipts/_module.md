---
schemaVersion: 1
module: 'packages/cli/tests/review-receipts'
sourceHash: '3e6754ee0999415a7cae21eb54ef525b2f188a064fda07f1c4315679a63ed3f0'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['gate-git.test.ts', 'io.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runCheckFindingsFile, runCheckReviewReceipt } from '../../src/review-receipts/gate'
import { CwdGit, sessionDirFrom } from '../../src/review-receipts/io'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
