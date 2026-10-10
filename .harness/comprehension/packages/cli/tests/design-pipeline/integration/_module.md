---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline/integration'
sourceHash: '2aed9fda66ef256dd5f5b8d4bdb293e80ec087532797142f44883824fc202f9e'
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
