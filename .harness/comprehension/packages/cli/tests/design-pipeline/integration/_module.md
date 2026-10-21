---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline/integration'
sourceHash: '53d7891f03d93b778b5dbc1cd5420f74e25b95f4c0dbf52c81a3662b4d3ab5a2'
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
