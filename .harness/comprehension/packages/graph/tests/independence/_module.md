---
schemaVersion: 1
module: 'packages/graph/tests/independence'
sourceHash: 'b6339684b168563dac80a5d23957981c06cc9edebd56bb9bcc7fc13142e4ed9e'
compiledAt: '2026-08-28T01:22:11.713Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['ConflictPredictor.test.ts', 'TaskIndependenceAnalyzer.test.ts']
---

## Summary

The `packages/graph/tests/independence` module validates two complementary task-parallelization components. **TaskIndependenceAnalyzer** detects which tasks can run in parallel by analyzing file overlaps at two levels: direct file overlap and transitive overlap via graph edges (configurable depth). It outputs task groupings that can execute in parallel "waves." **ConflictPredictor** wraps the analyzer and adds severity classification: high (direct file overlap → serialize), medium (transitive overlap on high-churn or highly-coupled files → coordinate), or low (transitive overlap on stable files → allow parallel). The predictor can regroup tasks differently than the analyzer—merging only on high-severity conflicts, whereas the analyzer merges on any overlap. This severity-aware pipeline ensures that transitive overlaps on stable files don't unnecessarily block parallelization.

## Invariants

- Input validation is shared across both components: must have ≥2 tasks, unique task IDs, and non-empty file arrays per task.
- Conflict severity is hierarchical: high (direct) > medium (transitive high-churn/coupling) > low (transitive stable); direct overlap always beats transitive for same pair.
- Regrouping asymmetry: only high-severity conflicts merge tasks; medium/low keep tasks separate—diverging from analyzer's 'any overlap merges' rule (flagged as regrouped=true).
- Percentile thresholds: high-churn and high-coupling determined by P80 across all graph nodes; a file must exceed P80 to upgrade transitive conflict from low to medium.
- Depth controls graph traversal: depth=0 skips graph entirely (file-only); depth=N expands task files through N edge hops with configurable edge types.
- Analysis level indicator: 'file-only' when no graph or depth=0; 'graph-expanded' when graph + depth>0; verdict must note degradation in file-only mode.
- Via tracking: each transitive overlap must record the original source file path that led to its discovery.
- Edge-type filtering: analysis respects caller-specified edge types (imports, calls, etc.); omitted types are ignored in graph expansion.
- Verdict content: must include parallelization capability (serial vs. parallel waves), group count, severity counts, and degradation warnings.
- Task grouping contract: conflicting tasks go into same group; independent tasks are separate; groups represent serial execution waves.

## Interface Contract

```ts

```

## Dependency Slice

```
import { ConflictPredictor } from '../../src/independence/ConflictPredictor.js'
import { TaskIndependenceAnalyzer } from '../../src/independence/TaskIndependenceAnalyzer.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import { describe, expect, it } from 'vitest'
```
