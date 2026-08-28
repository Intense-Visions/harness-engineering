---
schemaVersion: 1
module: 'packages/intelligence/src/cml'
sourceHash: '6c57a1f93993030e2a4bea7777671f076885bb86e818a0876ef517f8e9220a50'
compiledAt: '2026-08-28T01:22:11.838Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['historical.ts', 'scorer.ts', 'semantic.ts', 'signals.ts', 'structural.ts']
---

## Summary

The `cml` module is the Complexity Modeling Layer — it scores engineering changes by risk and routes them to appropriate handlers. Given an enriched spec and graph store, it combines three complexity dimensions into a single actionable score: Structural (graph-based cascade simulation estimating affected services/modules/files), Semantic (unknowns, ambiguities, risk signals from spec enrichment using diminishing-returns weighting), and Historical (peak failure rate from past execution outcomes with Laplace smoothing). The `score()` function returns overall complexity [0,1], confidence level, risk classification (low/medium/high/critical), recommended route (local/simulation/human), and reasoning. Downstream code uses `scoreToConcernSignals()` to emit structured alerts when thresholds cross.

## Invariants

- Weighted aggregate is load-bearing: scores normalize to [0,1]; overall = structural(0.5) + semantic(0.35) + historical(0.15), capped post-aggregation. Reweighting changes all routing decisions.
- Smoothing constant prevents outliers: SMOOTHING=2 ensures single failure yields ~0.33, not 1.0. Changes ripple into routing thresholds.
- Diminishing-returns decay shapes priority: DECAY=0.3 means first 2–3 items carry most weight, 10+ asymptote to 1.0. Changing decay flips complexity classification.
- Graph node IDs must resolve or data vanishes: Structural and historical scoring silently skip systems where graphNodeId === null. Missing IDs = zero contribution, not an error.
- Cascade simulator is non-fallible: CascadeSimulator.simulate() exceptions are caught and skipped silently. Corrupted graph entries produce zero contribution.
- Confidence is bucketed on data-source count: {0.3, 0.5, 0.8} based on how many of (structural, semantic, historical) are >0. Reflects coverage, not uncertainty; used for routing tiebreaks.
- Risk level thresholds are hardcoded: critical (≥0.8), high (≥0.6), medium (≥0.3), low (<0.3). Moving thresholds breaks routing guarantees.
- Structural normalization ceiling is invariant: Blast radius normalized against 100 nodes. Changing typical cascade sizes requires recalibration.
- Concern signal thresholds are fixed and independent: overall≥0.7, files>20, semantic>0.6 emit distinct signals. Changing one without others creates blind spots.

## Interface Contract

```ts
export computeHistoricalComplexity
export computeSemanticComplexity
export computeStructuralComplexity
export score
export scoreToConcernSignals
```

## Dependency Slice

```
import { BlastRadius, ComplexityScore, EnrichedSpec } from '../types.js'
import { computeHistoricalComplexity } from './historical.js'
import { computeSemanticComplexity } from './semantic.js'
import { computeStructuralComplexity } from './structural.js'
import { CascadeSimulator, GraphStore } from '@harness-engineering/graph'
import { ConcernSignal } from '@harness-engineering/types'
```
