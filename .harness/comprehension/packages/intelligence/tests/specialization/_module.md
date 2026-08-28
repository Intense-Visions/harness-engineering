---
schemaVersion: 1
module: 'packages/intelligence/tests/specialization'
sourceHash: '49db6f3a0d3fbf31b660498481ba949a3097e023f2a592394014ece423dbf098'
compiledAt: '2026-08-28T01:22:11.933Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['persistence.test.ts', 'scorer.test.ts', 'temporal.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { ExecutionOutcomeConnector } from '../../src/outcome/connector.js'
import { ExecutionOutcome } from '../../src/outcome/types.js'
import { ProfileStore, loadProfiles, refreshProfiles, saveProfiles } from '../../src/specialization/persistence.js'
import { buildSpecializationProfile, computeExpertiseLevel, computeSpecialization, weightedRecommendPersona } from '../../src/specialization/scorer.js'
import { decayWeight, temporalSuccessRate } from '../../src/specialization/temporal.js'
import { SpecializationProfile } from '../../src/specialization/types.js'
import { GraphStore } from '@harness-engineering/graph'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
