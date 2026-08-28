---
schemaVersion: 1
module: 'packages/core/src/rehearsal'
sourceHash: '4d8fc87f3d9b998f5cc9868e27387cd69c27ad23586fd90c871dc4a1599935ec'
compiledAt: '2026-08-28T01:22:10.460Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['catalog.test.ts', 'catalog.ts', 'index.ts', 'scoring.test.ts', 'scoring.ts', 'types.ts']
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
export scoreRecovery
```

## Dependency Slice

```
import { Err, Ok, Result } from '../shared/result'
import { MANIFEST_FILENAME, findFixture, loadCatalog, loadManifest } from './catalog'
import { REHEARSAL_WEIGHTS, rehearsalTierFor, scoreRecovery } from './scoring'
import { RecoveryRecord, RehearsalManifest, RehearsalManifestSchema, RehearsalScore, RehearsalTier, ScoreDimension } from './types'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
```
