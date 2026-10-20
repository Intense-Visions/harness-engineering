---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline/integration'
sourceHash: 'e654e8bbc1998dad996e6aed1bb8abddd3a99207da5d1dd6df85e58425e04700'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['end-to-end.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runDesignPipeline } from '../../../src/design-pipeline'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
