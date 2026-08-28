---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline/integration'
sourceHash: '6bd0c9799641516c31a07dd812c28115ebd08d923c329ee8bb71c0dadda3e6c5'
compiledAt: '2026-08-28T01:22:09.680Z'
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
