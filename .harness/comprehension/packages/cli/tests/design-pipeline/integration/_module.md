---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline/integration'
sourceHash: '18360d7fa023490bedd3662f34f7ba5a3ab0c946fca2d9c91b732f63bf12d40b'
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
