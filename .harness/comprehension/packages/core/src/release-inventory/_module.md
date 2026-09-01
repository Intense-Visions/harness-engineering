---
schemaVersion: 1
module: 'packages/core/src/release-inventory'
sourceHash: '705e47deed37d7a9b4e2673f37523ad7d166bcf59f62980f38f009a42a8dfec0'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'changesets.test.ts',
    'changesets.ts',
    'compute.test.ts',
    'compute.ts',
    'dates.ts',
    'evaluate.test.ts',
    'evaluate.ts',
    'index.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export DEFAULT_RELEASE_INVENTORY_THRESHOLDS
export PendingChangeset
export ReleaseChannel
export ReleaseInventory
export ReleaseInventoryBreach
export ReleaseInventoryFsPort
export ReleaseInventoryGitPort
export ReleaseInventoryResult
export ReleaseInventoryStatus
export ReleaseInventoryThresholds
export ReleaseTag
export UnreleasedCommit
export computeReleaseInventory
export describeChannel
export diffInWholeDays
export evaluateReleaseInventory
export parseChangesetBumps
export readPendingChangesets
```

## Dependency Slice

```
import { parseChangesetBumps, readPendingChangesets } from './changesets'
import { computeReleaseInventory, describeChannel } from './compute'
import { diffInWholeDays } from './dates'
import { evaluateReleaseInventory } from './evaluate'
import { DEFAULT_RELEASE_INVENTORY_THRESHOLDS, PendingChangeset, ReleaseChannel, ReleaseInventory, ReleaseInventoryBreach, ReleaseInventoryFsPort, ReleaseInventoryGitPort, ReleaseInventoryResult, ReleaseInventoryStatus, ReleaseInventoryThresholds, ReleaseTag, UnreleasedCommit } from './types'
import { describe, expect, it } from 'vitest'
```
