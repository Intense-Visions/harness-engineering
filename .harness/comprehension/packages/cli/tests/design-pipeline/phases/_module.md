---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline/phases'
sourceHash: '1b9ebb21dadbc95059f3579c579857d06e99946d8c3be5b6dd91a654945e92e7'
compiledAt: '2026-08-28T01:22:09.693Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['fill.test.ts', 'freshen.test.ts', 'report.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { BrandFinding } from '../../../src/brand/findings/finding'
import { newContext } from '../../../src/design-pipeline/context'
import { runFill } from '../../../src/design-pipeline/phases/fill'
import { runFreshen } from '../../../src/design-pipeline/phases/freshen'
import { runReport } from '../../../src/design-pipeline/phases/report'
import { DriftFinding } from '../../../src/drift/findings/finding'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
