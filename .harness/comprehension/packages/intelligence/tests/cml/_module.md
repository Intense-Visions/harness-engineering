---
schemaVersion: 1
module: 'packages/intelligence/tests/cml'
sourceHash: '976d7d77b9670d2917a084606a55b5ab116b9b11f2a00e7cd2188bea5db2ae5f'
compiledAt: '2026-08-28T01:22:11.908Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'historical.test.ts',
    'scorer.test.ts',
    'semantic.test.ts',
    'signals.test.ts',
    'structural.test.ts',
  ]
---

## Summary

The `packages/intelligence/tests/cml` module validates a three-dimensional complexity-scoring system that assesses specification risk via structural, semantic, and historical dimensions. Structural complexity derives from affected systems' transitive dependency footprint in the codebase graph—high fan-out or deep chains increase score. Semantic complexity measures textual risk signals: unknowns, ambiguities, and explicit risk flags. Historical complexity reweights systems based on past execution failure rates. The scorer combines these into a 0–1 score, assigns a risk level (low/medium/high), and recommends an execution route (local or escalated). Tests validate fallback behavior when graph data is absent, deterministic scoring, fair aggregation across multiple systems, and clamping invariants.

## Invariants

- Deterministic scoring: repeated calls with identical inputs produce identical scores (no randomness, no graph mutations)
- [0, 1] clamping: all individual dimensions and overall score clamp to 0–1; never overflow
- Graph fallback: when a system lacks a graphNodeId, structural complexity for that system is 0; scoring degrades gracefully to semantic-only
- Failure-rate proportionality: historical complexity strictly increases with failure rate (more failures → higher score for that system)
- Multi-system aggregation: multiple affected systems' scores contribute additively or via weighted composition (confidence-weighted)
- Confidence-aware: scorer records confidence reflecting data completeness (high when all systems have graph data and outcome history; low when sparse)
- Risk level + route mapping: overall < 0.3 → 'low' + 'local'; higher thresholds trigger 'medium'/'high' and escalated routes
- Reasoning materialization: score.reasoning is a non-empty string array explaining the scoring decision (transparency for downstream consumers)

## Interface Contract

```ts

```

## Dependency Slice

```
import { computeHistoricalComplexity } from '../../src/cml/historical.js'
import { score } from '../../src/cml/scorer.js'
import { computeSemanticComplexity } from '../../src/cml/semantic.js'
import { scoreToConcernSignals } from '../../src/cml/signals.js'
import { computeStructuralComplexity } from '../../src/cml/structural.js'
import { AffectedSystem, ComplexityScore, EnrichedSpec } from '../../src/types.js'
import { GraphStore } from '@harness-engineering/graph'
import { describe, expect, it } from 'vitest'
```
