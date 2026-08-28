---
schemaVersion: 1
module: 'packages/cli/tests/commands/graph'
sourceHash: '84920f57a37848052c8a81c4ba50e0a85dc2943194ab923206c3cbd96d23b9a2'
compiledAt: '2026-08-28T01:22:09.592Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['scan-req-annotation.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runScan } from '../../../src/commands/graph/scan'
import from '@harness-engineering/graph'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
