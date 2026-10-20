---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline'
sourceHash: 'd346a667fda737030e261ed9727e0eff4a1f6f63944c50438eaa3e2c473e2f8d'
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
