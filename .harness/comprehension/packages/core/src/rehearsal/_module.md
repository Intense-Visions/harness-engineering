---
schemaVersion: 1
module: 'packages/core/src/rehearsal'
sourceHash: 'fcdf3225483d6bd5be37d1c6d375ba080c7eceaa8e506b4fdf835b5f3eaec52e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'catalog.test.ts',
    'catalog.ts',
    'index.ts',
    'public-entry.test.ts',
    'scoring.test.ts',
    'scoring.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export *
export MANIFEST_FILENAME
export REHEARSAL_WEIGHTS
export findFixture
export loadCatalog
export loadManifest
export rehearsalTierFor
export rehearsalTierForScore
export scoreRecovery
```

## Dependency Slice

```
import { rehearsalTierFor, rehearsalTierForScore } from '../index'
import { Err, Ok, Result } from '../shared/result'
import { MANIFEST_FILENAME, findFixture, loadCatalog, loadManifest } from './catalog'
import { REHEARSAL_WEIGHTS, rehearsalTierForScore, scoreRecovery } from './scoring'
import { RecoveryRecord, RehearsalManifest, RehearsalManifestSchema, RehearsalScore, RehearsalTier, ScoreDimension } from './types'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
```
