---
schemaVersion: 1
module: 'packages/intelligence/src/uat-signoff'
sourceHash: '6d9f0244ee7c1a05f48f49cf63dfefb5856bb9ba53ff1f83031988ec0ee2cd2c'
compiledAt: '2026-08-28T01:22:11.867Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'recorder.ts', 'types.ts']
---

## Interface Contract

```ts
export UAT_SIGNOFF_SOURCE
export UatItemDisposition
export UatOverallDecision
export UatSignoffInput
export UatSignoffItem
export UatSignoffRecorder
export toUatExecutionOutcome
```

## Dependency Slice

```
import { ExecutionOutcomeConnector, OutcomeIngestResult } from '../outcome/connector.js'
import { ExecutionOutcome } from '../outcome/types.js'
import { UatSignoffInput } from './types.js'
import { GraphStore } from '@harness-engineering/graph'
import { randomUUID } from 'node:crypto'
```
