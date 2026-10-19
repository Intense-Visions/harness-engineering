---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline/integration'
sourceHash: '3318fff98146c72ac35a5581eb97f5e038b6036a311390d98e143caae94f785b'
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
