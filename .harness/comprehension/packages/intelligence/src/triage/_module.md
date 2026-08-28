---
schemaVersion: 1
module: 'packages/intelligence/src/triage'
sourceHash: '1b9a81c8c3c1debcebe9b21a14fc123883e811c821f776ee0ce98754e89bca22'
compiledAt: '2026-08-28T01:22:11.913Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'entities.test.ts',
    'entities.ts',
    'gate.test.ts',
    'gate.ts',
    'index.ts',
    'precedent.test.ts',
    'precedent.ts',
    'probe.test.ts',
    'probe.ts',
    'rank.test.ts',
    'rank.ts',
    'ratchet.test.ts',
    'ratchet.ts',
    'record.test.ts',
    'record.ts',
    'retrospective.test.ts',
    'retrospective.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export AUTO_EXECUTE_CATEGORIES
export ApprovedCandidate
export BLAST_TOLERANCE_ABS
export BLAST_TOLERANCE_FACTOR
export BrainstormInput
export BrainstormOutcome
export DEFAULT_RATCHET_CONFIG
export DEFAULT_RETROSPECTIVE_CONFIG
export DEPTH_BY_LEVEL
export DepthBudget
export EscalationCategory
export Fork
export ForkConfidence
export ForkDecision
export ForkGenerator
export GoNoGoCandidate
export GoNoGoDecision
export GoNoGoHoldReason
export GraphScope
export HaltReason
export HeldCandidate
export HoldReason
export LEVEL_RANK
export LeverResult
export OpenDecision
export PrecedentLookup
export PrecedentRate
export ProbeConfig
export ProbeDeps
export ProbeInput
export ProbeLevers
export RankableCandidate
export RatchetConfig
export RatchetOutcome
export RatchetStage
export ResolvedEntity
export RetrospectiveComparison
export RetrospectiveConfig
export ScopeEstimate
export SpecDraft
export StagedGoNoGoCandidate
export TriageOutcome
export TriagePrediction
export TriageRecord
export TriageVerdict
export V1Stage
export V1_MAX_STAGE
export aggregatePrecedent
export compareToPrediction
export depthForLevel
export dispatchableShapeKey
export extractEntities
export pilotScore
export precedentLookupFromRecords
export rankTriageCandidates
export resolveGoNoGo
export resolveGoNoGoStaged
export resolveStage
export runAutoBrainstorm
export runScopingProbe
export shapeKey
```

## Dependency Slice

```
import { AnalysisProvider, AnalysisResponse } from '../analysis-provider/interface.js'
import { ClassifyInput, classify } from '../complexity/classifier.js'
import { CONFIDENCE_RANK } from '../complexity/static-pass.js'
import { ComplexitySignals } from '../complexity/types.js'
import { extractEntities } from './entities.js'
import { AUTO_EXECUTE_CATEGORIES, GoNoGoCandidate, StagedGoNoGoCandidate, resolveGoNoGo, resolveGoNoGoStaged } from './gate.js'
import { aggregatePrecedent, precedentLookupFromRecords } from './precedent.js'
import { ProbeDeps, runScopingProbe } from './probe.js'
import { RankableCandidate, pilotScore, rankTriageCandidates } from './rank.js'
import { DEFAULT_RATCHET_CONFIG, RatchetOutcome, V1_MAX_STAGE, resolveStage } from './ratchet.js'
import { PrecedentLookup, PrecedentRate, RatchetStage, TriageOutcome, TriagePrediction, TriageRecord, dispatchableShapeKey, shapeKey } from './record.js'
import { LEVEL_RANK, compareToPrediction } from './retrospective.js'
import { GraphScope, HoldReason, LeverResult, OpenDecision, ProbeInput, ProbeLevers, ResolvedEntity, ScopeEstimate, TriageVerdict } from './types.js'
import { ComplexityLevel, ComplexityVerdict, RoutingTaskText, ScopeTier } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
```
