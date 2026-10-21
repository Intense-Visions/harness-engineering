---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline/integration'
sourceHash: '31b8204b3c096260383e55a21fe003b611a5a2c4f822feeef5b13be00aaa360c'
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
