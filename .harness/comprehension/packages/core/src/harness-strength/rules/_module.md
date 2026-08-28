---
schemaVersion: 1
module: 'packages/core/src/harness-strength/rules'
sourceHash: 'b7cbf0bc55ceffa7c9119fd201905f138678a18d275c59212b1b97b8e4b6ca35'
compiledAt: '2026-08-28T01:22:10.436Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'index.test.ts',
    'index.ts',
    'strength-001-nonblocking-hooks.test.ts',
    'strength-001-nonblocking-hooks.ts',
    'strength-002-autobaseline.test.ts',
    'strength-002-autobaseline.ts',
    'strength-003-skip-list.test.ts',
    'strength-003-skip-list.ts',
    'strength-004-empty-thresholds.test.ts',
    'strength-004-empty-thresholds.ts',
    'strength-005-lowest-tier.test.ts',
    'strength-005-lowest-tier.ts',
    'strength-006-autoapprove-baseline.test.ts',
    'strength-006-autoapprove-baseline.ts',
    'strength-007-snapshot-signal-mismatch.test.ts',
    'strength-007-snapshot-signal-mismatch.ts',
  ]
---

## Interface Contract

```ts
export ALL_RULES
```

## Dependency Slice

```
import { CHECK_SIGNAL_MAP } from '../../health-signals'
import { HarnessConfigSubset, ProjectContext, StrengthFinding, StrengthRule } from '../types'
import { ALL_RULES } from './index'
import { strength001NonblockingHooks } from './strength-001-nonblocking-hooks'
import { strength002Autobaseline } from './strength-002-autobaseline'
import { strength003SkipList } from './strength-003-skip-list'
import { strength004EmptyThresholds } from './strength-004-empty-thresholds'
import { strength005LowestTier } from './strength-005-lowest-tier'
import { strength006AutoapproveBaseline } from './strength-006-autoapprove-baseline'
import { strength007SnapshotSignalMismatch } from './strength-007-snapshot-signal-mismatch'
import { describe, expect, it } from 'vitest'
```
