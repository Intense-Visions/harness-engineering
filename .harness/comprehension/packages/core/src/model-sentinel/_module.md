---
schemaVersion: 1
module: 'packages/core/src/model-sentinel'
sourceHash: '869aec7c7d27cc08b2b57dbfbcdc7e8b461483a85669482d852cf0a132088a34'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'drift.test.ts',
    'drift.ts',
    'evaluate.test.ts',
    'evaluate.ts',
    'index.ts',
    'snapshot.test.ts',
    'snapshot.ts',
    'store.test.ts',
    'store.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export BackendModelDelta
export BackendModelIdentity
export DriftKind
export DriftSeverity
export ModelDriftResult
export ModelSnapshot
export RawBackendsMap
export SENTINEL_HISTORY_RELPATH
export SentinelCycleResult
export SentinelRecord
export acknowledgeModelDrift
export appendSentinelRecord
export detectModelDrift
export evaluateModelSentinel
export fnv1aHex
export hasUnacknowledgedMaterialDrift
export latestSnapshot
export readSentinelHistory
export sentinelHistoryPath
export snapshotModelIdentities
```

## Dependency Slice

```
import { detectModelDrift } from './drift'
import { acknowledgeModelDrift, evaluateModelSentinel, hasUnacknowledgedMaterialDrift } from './evaluate'
import { RawBackendsMap, fnv1aHex, snapshotModelIdentities } from './snapshot'
import { appendSentinelRecord, latestSnapshot, readSentinelHistory, sentinelHistoryPath } from './store'
import { BackendModelDelta, BackendModelIdentity, DriftSeverity, ModelDriftResult, ModelSnapshot, SentinelCycleResult, SentinelRecord } from './types'
import * as fs, { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
