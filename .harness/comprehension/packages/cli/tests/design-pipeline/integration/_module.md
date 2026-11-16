---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline/integration'
sourceHash: '34c225f8ba9ac41b63cc1e729e1f96c11101db02e0ec439e695dbb0098b73725'
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
