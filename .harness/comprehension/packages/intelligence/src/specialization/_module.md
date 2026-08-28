---
schemaVersion: 1
module: 'packages/intelligence/src/specialization'
sourceHash: '6ef08be3a5d3b1e718047b1bdaa4b7b586eb55c86625a9f593bf5e9c14c8b76a'
compiledAt: '2026-08-28T01:22:11.859Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['persistence.ts', 'scorer.ts', 'temporal.ts', 'types.ts']
---

## Summary

The `specialization` module tracks agent expertise across systems and task types by scoring historical execution outcomes. It discovers `execution_outcome` nodes from the knowledge graph (tagged with `agentPersona`), groups them by (persona, system, taskType), and computes composite scores across three dimensions: temporal success rate (recent outcomes weighted via exponential decay with 30-day half-life), consistency (stability measured via 5-outcome rolling windows), and volume (log-scaled sample count bonus). These combine as 60% temporal + 25% consistency + 15% volume to produce a [0, 1] composite score that multiplies base persona recommendations for intelligent routing to specialists. Profiles persist at `.harness/specialization-profiles.json` across sessions; `refreshProfiles()` recomputes all personas' full profiles including strengths, weaknesses, and median expertise tier on startup or after analysis passes. Core exports: type contracts, scoring functions (`computeExpertiseLevel`, `computeSpecialization`, `buildSpecializationProfile`, `weightedRecommendPersona`), temporal decay logic (`decayWeight`, `temporalSuccessRate`), and persistence I/O (`loadProfiles`, `saveProfiles`, `refreshProfiles`).

## Invariants

- Execution outcomes must have non-empty agentPersona string metadata; records without it are skipped entirely
- Timestamps must be ISO-8601 or Date.parse()-compatible strings; used for sorting outcomes by age and computing temporal decay
- Graph outcome_of edges encode outcome→system relationship; missing edges drop that outcome's contribution to the bucket
- Missing taskType metadata defaults to '\*' wildcard, not undefined or null; enables aggregation across task types
- Expertise tier thresholds are hard-coded: <5 samples→novice, 5-15 samples with <60% success→novice, 15-30 samples threshold 70%, ≥30 samples threshold 75% for expert
- Consistency score uses fixed 5-outcome rolling window; datasets <5 outcomes fall back to simple win-rate average
- Score weights are fixed: W_TEMPORAL=0.6, W_CONSISTENCY=0.25, W_VOLUME=0.15; sum must equal 1.0 for valid composite calculation
- Profile storage path is static: always .harness/specialization-profiles.json relative to projectRoot; no runtime configuration
- Weaknesses defined by hard threshold: temporal success rate < 0.5; top 3 lowest-rate entries are flagged as weaknesses
- Overall profile expertise level is median of entry levels, not mean or max; depends on sorted tier indices [0=novice, 1=competent, 2=proficient, 3=expert]
- Specialization multiplier is clamped to [0.5, 1.5] via formula 0.5 + meanComposite; ensures neutral 1.0 when no specialization data exists
- Volume bonus uses log₂ scale: log₂(sampleSize+1) / log₂(EXPERT_THRESHOLD+1) with EXPERT_THRESHOLD=30, capped at 1.0; outcome counts must be positive integers
- Laplace smoothing in temporalSuccessRate adds smoothingWeight pseudo-successes and failures; smoothingWeight = totalWeight / outcomesLength for stability at low sample counts
- TaskType is re-exported from ../outcome/types.js; if that type changes, all specialization consumers break at import time

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
