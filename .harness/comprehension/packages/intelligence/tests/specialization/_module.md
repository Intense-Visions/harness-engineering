---
schemaVersion: 1
module: 'packages/intelligence/tests/specialization'
sourceHash: '49db6f3a0d3fbf31b660498481ba949a3097e023f2a592394014ece423dbf098'
compiledAt: '2026-08-28T01:22:11.933Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['persistence.test.ts', 'scorer.test.ts', 'temporal.test.ts']
---

## Summary

The `specialization` test module validates a persona expertise profiling system that tracks agent performance across different task types and code modules. It ingests execution outcomes (successes/failures) through an `ExecutionOutcomeConnector`, computes specialization scores grouped by persona/task-type/module, and assigns expertise levels (novice→competent→proficient→expert) based on sample size and success rate. Profiles are persisted as versioned JSON and used downstream to recommend the best-fit persona for a given task. The module has two layers: persistence (load/save/refresh from `.harness/specialization-profiles.json`) and scoring (compute temporal success rate, consistency, volume bonus with composite weighting).

## Invariants

- Expertise levels are strictly stage-gated by sample count and success-rate thresholds: <5 samples → novice; 5–14 with SR≥0.6 → competent; 15–29 with SR≥0.7 → proficient; 30+ with SR≥0.75 → expert
- Composite score is a fixed weighted blend: 0.6×temporalSuccessRate + 0.25×consistencyScore + 0.15×volumeBonus
- All score components (temporalSuccessRate, consistencyScore, volumeBonus, composite) are bounded to [0, 1]
- Specialization entries are grouped by the immutable tuple (persona, systemNodeId, taskType); outcomes without taskType normalize to '\*'
- ProfileStore versioning is static at version 1 and must round-trip save/load identically
- Profiles persist to exactly `.harness/specialization-profiles.json` relative to working directory
- Temporal decay applies uniformly across all outcomes; older outcomes decay with configurable half-life (default 30 days from referenceTime)

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
