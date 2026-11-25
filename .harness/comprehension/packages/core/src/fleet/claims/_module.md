---
schemaVersion: 1
module: 'packages/core/src/fleet/claims'
sourceHash: 'b67e5283db9495c10f1f6f8622ab47cda439b50243356aa54951e540cdcfcbbf'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'claim.ts',
    'index.test.ts',
    'index.ts',
    'select.test.ts',
    'select.ts',
    'two-runner.integration.test.ts',
  ]
---

## Interface Contract

```ts
export *
```

## Dependency Slice

```
import { isLeaseLive, parseClaimComment } from './claim'
import { CLAIM_LABEL, CLAIM_MARKER, DEFAULT_LEASE_SECONDS, HEARTBEAT_SECONDS, buildClaimBody, isLeaseLive, parseClaimComment, resolveClaimWinner } from './index'
import { ItemClaimContext, classifyClaim, selectUnclaimed } from './select'
import { FLEET_CLAIM_VERSION, FleetClaim, FleetClaimSchema } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
