---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline'
sourceHash: 'c41553a1ae4f9a50f2f6df795e2b774e37c14c1bbd015d2b1d7bbfdb08a56672'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['registry.test.ts', 'verdict-abstention.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runDesignPipeline } from '../../src/design-pipeline'
import { newContext } from '../../src/design-pipeline/context'
import { runAudit } from '../../src/design-pipeline/phases/audit'
import { runReport } from '../../src/design-pipeline/phases/report'
import { VerifierRegistry } from '../../src/design-pipeline/registry'
import { Verifier } from '../../src/shared/verifier'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
