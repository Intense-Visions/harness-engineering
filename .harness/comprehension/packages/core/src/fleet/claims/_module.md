---
schemaVersion: 1
module: 'packages/core/src/fleet/claims'
sourceHash: '5ad65f452944dfacc681e873c1d61cfca79825157f920dc3ef47127f40c7e12a'
compiledAt: '2026-08-28T01:22:10.396Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['index.test.ts', 'index.ts', 'select.test.ts', 'select.ts', 'two-runner.integration.test.ts']
---

## Interface Contract

```ts
export *
export CLAIM_LABEL
export CLAIM_MARKER
export DEFAULT_LEASE_SECONDS
export HEARTBEAT_SECONDS
export buildClaimBody
export isLeaseLive
export parseClaimComment
export resolveClaimWinner
```

## Dependency Slice

```
import { CLAIM_LABEL, CLAIM_MARKER, DEFAULT_LEASE_SECONDS, HEARTBEAT_SECONDS, buildClaimBody, isLeaseLive, parseClaimComment, resolveClaimWinner } from './index'
import { ItemClaimContext, classifyClaim, selectUnclaimed } from './select'
import { FLEET_CLAIM_VERSION, FleetClaim, FleetClaimSchema } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
