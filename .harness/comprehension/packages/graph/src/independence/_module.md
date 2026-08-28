---
schemaVersion: 1
module: 'packages/graph/src/independence'
sourceHash: '1395b91d85f6555713ee272b634732c5961e8c985489240520956503f48f5c6d'
compiledAt: '2026-08-28T01:22:11.594Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['ConflictPredictor.ts', 'TaskIndependenceAnalyzer.ts', 'index.ts']
---

## Summary

The **independence** module predicts task scheduling conflicts by analyzing whether concurrent tasks can safely run in parallel. It detects direct file overlaps (same file written by multiple tasks) and transitive overlaps through the dependency graph. The core class, `ConflictPredictor`, classifies detected conflicts by severity and groups high-risk tasks using union-find, producing a `ConflictPrediction` with parallel scheduling groups and a human-readable verdict. The module integrates churn and coupling metrics from the graph to elevate transitive-overlap severity from 'low' to 'medium' when overlaps occur in frequently-changing or highly-coupled code, making conflict assessment risk-aware.

## Invariants

- Direct overlaps always classify as high-severity; transitive overlaps start at 'low' and only escalate to 'medium' if the overlapped file exceeds the 80th percentile for churn or coupling.
- High-severity conflicts are the only edges merged in union-find grouping; medium and low conflicts do not force tasks into serialized groups, ensuring low-risk overlaps don't unnecessarily block parallelism.
- Metric thresholds are per-store-invocation; if GraphStore is absent, thresholds become Infinity, disabling metric-based escalation — all transitive overlaps remain 'low'.
- Only non-independent pairs generate ConflictDetail records; pairs where pair.independent === false are silently dropped.
- Regrouping detection is exact via normalized comparison; the regrouped flag correctly identifies whether conflict analysis produced a different task grouping than the input by comparing sorted group sets.
- Path compression in union-find preserves rank-based merging, ensuring both correctness and amortized O(α) performance for grouping.
- Verdict and summary always reflect the same conflict set; severity counts and verdict narrative are derived from the same ConflictDetail array, so they cannot diverge.

## Interface Contract

```ts
export ConflictDetail
export ConflictPrediction
export ConflictPredictor
export ConflictSeverity
export IndependenceCheckParams
export IndependenceResult
export OverlapDetail
export PairResult
export TaskDefinition
export TaskIndependenceAnalyzer
```

## Dependency Slice

```
import { GraphComplexityAdapter } from '../entropy/GraphComplexityAdapter.js'
import { GraphCouplingAdapter } from '../entropy/GraphCouplingAdapter.js'
import { ContextQL } from '../query/ContextQL.js'
import { GraphStore } from '../store/GraphStore.js'
import { EdgeType } from '../types.js'
import { IndependenceCheckParams, OverlapDetail, PairResult, TaskIndependenceAnalyzer } from './TaskIndependenceAnalyzer.js'
```
