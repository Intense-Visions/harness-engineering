---
schemaVersion: 1
module: 'packages/intelligence/src/specialization'
sourceHash: '6ef08be3a5d3b1e718047b1bdaa4b7b586eb55c86625a9f593bf5e9c14c8b76a'
compiledAt: '2026-08-28T01:22:11.859Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['persistence.ts', 'scorer.ts', 'temporal.ts', 'types.ts']
---

## Interface Contract

```ts
export TaskType
export buildSpecializationProfile
export computeExpertiseLevel
export computeSpecialization
export decayWeight
export loadProfiles
export refreshProfiles
export saveProfiles
export temporalSuccessRate
export weightedRecommendPersona
```

## Dependency Slice

```
import { recommendPersona } from '../effectiveness/scorer.js'
import { TaskType } from '../outcome/types.js'
import { SpecializationOptions, buildSpecializationProfile } from './scorer.js'
import { TemporalConfig, temporalSuccessRate } from './temporal.js'
import { ExpertiseLevel, SpecializationEntry, SpecializationProfile, WeightedRecommendation } from './types.js'
import { GraphStore } from '@harness-engineering/graph'
import * as fs from 'fs'
import * as path from 'path'
```
