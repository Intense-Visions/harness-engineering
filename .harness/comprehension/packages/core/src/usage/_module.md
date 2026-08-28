---
schemaVersion: 1
module: 'packages/core/src/usage'
sourceHash: 'b5a49c7b1ad1a19382e781b11955147b758b216a36ab3aa9ddfe7ae0a4faadcc'
compiledAt: '2026-08-28T01:22:10.664Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['aggregator.ts', 'cc-parser.ts', 'index.ts', 'jsonl-reader.ts']
---

## Interface Contract

```ts
export aggregateByDay
export aggregateBySession
export parseCCRecords
export readCostRecords
```

## Dependency Slice

```
import { DailyUsage, SessionUsage, TokenUsage, UsageRecord } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
```
