---
schemaVersion: 1
module: 'packages/cli/src/ci'
sourceHash: 'a1465d8ca94a984eab55e8662b22fefa0ad81f1f0d46818ca4b4743d58a49ed8'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['attribute-failure.ts']
---

## Interface Contract

```ts
export AttributeFailureError
export attributePrFailure
export describeLogFailure
export execGh
```

## Dependency Slice

```
import { AttributionResult, CorrelatedRun, FailingTest, FlakeVerdict, RunObservation, RunOrigin, attributeFailure, parseFailingTests, testKey } from '@harness-engineering/core'
import { execFile } from 'node:child_process'
```
