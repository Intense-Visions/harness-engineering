---
schemaVersion: 1
module: 'packages/cli/src/ci'
sourceHash: '0a4e7bb615893007b98e93454ae6b4b56433f78b750336899f2b1ae81922044a'
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
