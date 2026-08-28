---
schemaVersion: 1
module: 'packages/core/tests/usage'
sourceHash: 'cf2df9d69d3757e0fcc8a648cdf86f74a48499087e3a7350bfda8ca90ec0b803'
compiledAt: '2026-08-28T01:22:11.130Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['aggregator.test.ts', 'cc-parser.test.ts', 'jsonl-reader.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { aggregateByDay, aggregateBySession } from '../../src/usage/aggregator'
import { parseCCRecords } from '../../src/usage/cc-parser'
import { readCostRecords } from '../../src/usage/jsonl-reader'
import { UsageRecord } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
