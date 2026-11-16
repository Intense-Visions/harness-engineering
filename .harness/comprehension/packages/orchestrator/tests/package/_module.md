---
schemaVersion: 1
module: 'packages/orchestrator/tests/package'
sourceHash: '9b766ab515d71d23098fa25a297ef0ea868583a5502f816750dfd2254ef8ded9'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['entry-points.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
```
