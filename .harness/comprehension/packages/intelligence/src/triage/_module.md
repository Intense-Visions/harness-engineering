---
schemaVersion: 1
module: 'packages/intelligence/src/triage'
sourceHash: '1b9a81c8c3c1debcebe9b21a14fc123883e811c821f776ee0ce98754e89bca22'
compiledAt: '2026-08-28T01:22:11.913Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

`packages/intelligence/src/triage` is the decision layer for roadmap auto-triage—it determines whether a work item should auto-execute, be held for human review, or escalate. The module composes pure decision functions: entity extraction (pulls symbol/path names from item prose via 4 regex patterns, returns explicit empty array for unstructured text), go/no-go gating (partitions items into approved/held based on human flag + auto-executable category check), and supporting triage primitives (ranking, precedent aggregation, scoping probes, ratcheted stages, retrospective comparison, record-keeping).

## Invariants

- Entity extraction is naive by design—only 4 signal shapes (backticked, path, CamelCase, dotted), no NLQ fallback. Empty result is load-bearing; weak extraction collapses the scope lever.
- No item dispatches without human go—resolveGoNoGo requires explicit human approval AND auto-executable category. Both gates must pass; neither is optional.
- Category gate precedes approval gate—'not-auto-executable' surfaces before 'awaiting-human-go', telling operators why an approved item still can't run.
- Stages 1–2 use uniform auth; stages 3–4 refuse all—stage only rides on approved items; it never relaxes the human-go requirement or allows deferred stages to auto-dispatch.
- Entity extraction is layer-pure—zero dependencies on graph/core; resolution against the graph is the scope lever's job in Phase 1, not the extractor's.
- Tests are P1 contract, not buried—entities.test.ts ships with the extractor because weak extraction is a failure mode of the whole triage system.

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
