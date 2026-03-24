# Conflict Prediction

> Severity-aware conflict analysis with automatic parallel group recomputation before agent dispatch.

**Keywords:** conflict-prediction, parallel-dispatch, severity, union-find, graph-heuristics, churn, coupling

## Overview

Conflict Prediction extends the existing task independence detection system (`TaskIndependenceAnalyzer`) with three-tier severity classification, human-readable reasoning per conflict, and automatic regrouping that serializes high-severity conflicts. Before the parallel coordinator dispatches agents, it calls `predict_conflicts` to get a conflict matrix that replaces the binary pass/fail independence check with actionable predictions.

### Goals

1. Classify conflict severity for every task pair using graph-enriched heuristics (no LLM calls)
2. Automatically regroup tasks so high-severity conflicts are serialized, medium/low are not
3. Provide per-conflict reasoning strings explaining why the conflict exists and what to do
4. Expose as MCP tool `predict_conflicts` and integrate into the `harness-parallel-agents` skill
5. Maintain graceful degradation when graph is unavailable (file-only with conservative severity)

### Non-Goals

- LLM-augmented reasoning (future consideration)
- Function-level granularity (requires AST parsing not currently available)
- Custom severity thresholds or configurable scoring formulas
- Modifying the existing `check_task_independence` tool (it remains for simple pass/fail)

## Decisions

| Decision             | Choice                                                            | Rationale                                                                                                   |
| -------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Intelligence level   | Graph-enriched heuristics                                         | Fast, deterministic, composable. No LLM latency or cost. Existing adapters provide churn and coupling data. |
| Dispatch integration | Automatic regrouping                                              | Natural evolution of existing union-find grouping. High-severity edges merge groups; medium/low do not.     |
| Severity model       | Three-tier (high/medium/low)                                      | Maps cleanly to actions: serialize, warn, info. Expressive without over-engineering.                        |
| Class design         | Separate `ConflictPredictor` composing `TaskIndependenceAnalyzer` | Keeps analyzer stable and well-tested. Prediction logic evolves independently.                              |
| Location             | `packages/graph/src/independence/`                                | Co-located with analyzer for type sharing and natural discovery.                                            |
| Read/write inference | All declared files assumed written                                | Conservative — matches current contract where tasks declare files they modify.                              |
| Churn threshold      | Top 20th percentile via `GraphComplexityAdapter`                  | Reuses existing hotspot analysis pattern. Avoids expensive median computation.                              |
| Coupling threshold   | Top 20th percentile via `GraphCouplingAdapter`                    | Consistent with churn threshold strategy. Uses existing adapter.                                            |

## Technical Design

### New Types

```typescript
type ConflictSeverity = 'high' | 'medium' | 'low';

interface ConflictDetail {
  taskA: string;
  taskB: string;
  severity: ConflictSeverity;
  reason: string; // e.g. "Both tasks write to src/config.ts"
  mitigation: string; // e.g. "Serialize: run taskA before taskB"
  overlaps: readonly OverlapDetail[];
}

interface ConflictPrediction {
  tasks: readonly string[];
  analysisLevel: 'graph-expanded' | 'file-only';
  depth: number;
  conflicts: readonly ConflictDetail[];
  groups: readonly (readonly string[])[]; // revised parallel groups
  summary: {
    high: number;
    medium: number;
    low: number;
    regrouped: boolean; // true if groups differ from naive grouping
  };
  verdict: string;
}
```

### Severity Classification

| Condition                                                                       | Severity | Action                            | Reason Template                                                |
| ------------------------------------------------------------------------------- | -------- | --------------------------------- | -------------------------------------------------------------- |
| Direct file overlap (both tasks list same file)                                 | High     | Serialize — merge into same group | "Both tasks write to {file}"                                   |
| Transitive overlap on high-churn file (top 20th percentile `changeFrequency`)   | Medium   | Warn — allow parallel, flag risk  | "Transitive overlap on high-churn file {file} (via {via})"     |
| Transitive overlap on high-coupling node (top 20th percentile `fanIn + fanOut`) | Medium   | Warn — allow parallel, flag risk  | "Transitive overlap on highly-coupled file {file} (via {via})" |
| Transitive-only overlap, low churn, low coupling                                | Low      | Info — no regrouping              | "Transitive overlap on {file} (via {via}) — low risk"          |

**Without graph:** All direct overlaps = high, all transitive overlaps = low (no churn/coupling data). Verdict notes graph unavailability.

**Missing metrics for a node:** Treat as unknown → classify transitive overlap as low (don't over-serialize).

### ConflictPredictor Class

```typescript
class ConflictPredictor {
  private readonly store: GraphStore | undefined;

  constructor(store?: GraphStore);

  predict(params: IndependenceCheckParams): ConflictPrediction;
}
```

**Algorithm:**

1. Create internal `TaskIndependenceAnalyzer(store)` and call `analyzer.analyze(params)` to get base `IndependenceResult`
2. If graph available, run `GraphComplexityAdapter.analyze(store)` and `GraphCouplingAdapter.analyze(store)` to get churn and coupling data
3. Compute 80th percentile thresholds for `changeFrequency` and `fanIn + fanOut`
4. For each `PairResult` from the analyzer:
   - If `independent === true` → skip (no conflict)
   - For each overlap, classify severity using the rules above
   - Take the **highest** severity among all overlaps as the pair's severity
   - Generate `reason` and `mitigation` strings from templates
5. Build revised parallel groups using union-find over **high-severity edges only** (own implementation, ~30 lines)
6. Compare revised groups against the analyzer's original groups to set `summary.regrouped`
7. Generate verdict summarizing conflict counts and regrouping impact

**Churn and coupling lookups** use existing adapters:

- `GraphComplexityAdapter(store).analyze()` → `hotspots[].changeFrequency` per file
- `GraphCouplingAdapter(store).analyze()` → `files[].fanIn`, `files[].fanOut` per file

These are computed once per `predict()` call and cached in local maps for O(1) per-file lookup.

### MCP Tool: predict_conflicts

```typescript
// Input schema
{
  path: string;              // project root (required)
  tasks: TaskDefinition[];   // 2+ tasks (required)
  depth?: number;            // expansion depth (default: 1)
  edgeTypes?: string[];      // edge types for expansion
  mode?: 'summary' | 'detailed';  // summary omits overlap details
}

// Output: ConflictPrediction JSON
```

Registered in `packages/cli/src/mcp/server.ts` alongside existing tools. Handler in `packages/cli/src/mcp/tools/conflict-prediction.ts`.

### Skill Integration

In `harness-parallel-agents/SKILL.md`, step 1 changes from:

> Use `check_task_independence` to verify tasks are independent

to:

> Use `predict_conflicts` to get conflict predictions. Use the returned `groups` for dispatch. Flag any medium-severity conflicts to the coordinator. If high-severity conflicts forced regrouping (`summary.regrouped === true`), log which tasks were serialized and why.

The skill falls back to `check_task_independence` if `predict_conflicts` is unavailable.

### File Layout

```
packages/graph/src/independence/
  ├── TaskIndependenceAnalyzer.ts  (existing, unchanged)
  ├── ConflictPredictor.ts         (new)
  └── index.ts                     (updated — re-exports new types + class)

packages/cli/src/mcp/tools/
  ├── task-independence.ts          (existing, unchanged)
  └── conflict-prediction.ts       (new)

packages/graph/tests/independence/
  ├── TaskIndependenceAnalyzer.test.ts  (existing, unchanged)
  └── ConflictPredictor.test.ts         (new)

packages/cli/tests/mcp/tools/
  ├── task-independence.test.ts         (existing, unchanged)
  └── conflict-prediction.test.ts       (new)
```

## Success Criteria

1. When two tasks list the same file, `predict()` returns a high-severity conflict with reason "Both tasks write to {file}" and mitigation "Serialize"
2. When tasks have transitive overlap on a top-20th-percentile churn file, severity is medium
3. When tasks have transitive overlap on a top-20th-percentile coupling file, severity is medium
4. When tasks have transitive-only overlap with low churn and coupling, severity is low
5. High-severity conflicts cause regrouping — affected tasks appear in the same group
6. Medium and low conflicts do not cause regrouping — groups match analyzer output
7. Every `ConflictDetail` has non-empty `reason` and `mitigation` strings
8. Without graph: direct overlaps → high, transitive → low, verdict notes degradation
9. Missing metrics for a node → transitive overlap classified as low
10. MCP tool `predict_conflicts` returns valid `ConflictPrediction` JSON in both summary and detailed modes
11. Parallel-agents skill step 1 references `predict_conflicts` with fallback to `check_task_independence`
12. Existing `check_task_independence` tool and its 37 tests are unchanged and passing

## Implementation Order

1. **Core `ConflictPredictor` class** — severity classification, reasoning generation, union-find regrouping
2. **Unit tests** — all severity paths, regrouping behavior, graceful degradation, missing metrics
3. **MCP tool** — handler, definition, registration in server.ts
4. **MCP tool tests** — integration tests mirroring `task-independence.test.ts` patterns
5. **Skill update** — update `harness-parallel-agents/SKILL.md` step 1
6. **Export updates** — re-export new types and class from `index.ts`
