---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline/phases'
sourceHash: '0f4ea697836311abd268c9fab55b8f09245811d9d2e1c1e7781c10e16f427ec6'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['fill.test.ts', 'fix.test.ts', 'freshen.test.ts', 'report.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { BrandFinding } from '../../../src/brand/findings/finding'
import { CraftFinding } from '../../../src/design-craft/findings/schema'
import { newContext } from '../../../src/design-pipeline/context'
import { runFill } from '../../../src/design-pipeline/phases/fill'
import from '../../../src/design-pipeline/phases/fix'
import { runFreshen } from '../../../src/design-pipeline/phases/freshen'
import { runReport } from '../../../src/design-pipeline/phases/report'
import { DriftFinding } from '../../../src/drift/findings/finding'
import from '../../../src/mcp/tools/align-design-system'
import from '../../../src/mcp/tools/detect-drift'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
