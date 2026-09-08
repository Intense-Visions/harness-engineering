---
schemaVersion: 1
module: 'packages/cli/tests/commands/graph'
sourceHash: '9f554e9011dd62969c56320bc2269de2a4594896c3f0efc69cdd984919526513'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'bench-cov544.test.ts',
    'index-cov544.test.ts',
    'ingest-cov544b.test.ts',
    'query-cov544b.test.ts',
    'scan-req-annotation.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnswerQualityAxis, createBenchCommand, formatAnswerQuality } from '../../../src/commands/graph/bench'
import { createGraphCommand } from '../../../src/commands/graph/index'
import { createIngestCommand } from '../../../src/commands/graph/ingest'
import { createPathCommand, createQueryCommand, runShortestPath } from '../../../src/commands/graph/query'
import { runScan } from '../../../src/commands/graph/scan'
import from '@harness-engineering/graph'
import { Command } from 'commander'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
