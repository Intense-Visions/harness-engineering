# MCP Tool Workflows

Practical workflows showing how to combine harness MCP tools for common development tasks. Each workflow lists the tools in recommended order with brief descriptions of what each step produces.

For the complete tool reference with all parameters, see [MCP Tools Reference](../reference/mcp-tools.md).

## Prerequisites

The harness MCP server must be running. Configure it in your AI agent's MCP settings:

```json
{
  "mcpServers": {
    "harness": {
      "command": "harness-mcp"
    }
  }
}
```

All tools accept a `path` parameter pointing to your project root. Most tools support a `mode` parameter (`summary` or `detailed`) to control response density.

---

## 1. Starting a New Feature

Assess the codebase, get skill recommendations, and gather context before writing code.

### Steps

| Step | Tool               | Purpose                                                                                                                                           |
| ---- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `recommend_skills` | Analyze codebase health and get a prioritized list of skills to apply. Returns urgency markers so you know what to address first.                 |
| 2    | `gather_context`   | Pull relevant context from the knowledge graph, session learnings, and prior handoffs. Provides the background needed to make informed decisions. |
| 3    | `assess_project`   | Run all health checks (validate, deps, docs, entropy, security, perf, lint) in parallel. Establishes a baseline before changes.                   |

### Example Sequence

```
1. recommend_skills(path: ".", recentFiles: ["src/services/payment.ts"])
   -> "High: align-documentation (3 stale refs), Medium: detect-doc-drift"

2. gather_context(path: ".", intent: "add payment retry logic")
   -> Graph context for payment service, related learnings, session history

3. assess_project(path: ".", mode: "summary")
   -> Baseline: 0 layer violations, 2 doc gaps, 1 perf warning
```

### When to Use

- Starting work on a new feature branch
- Picking up an unfamiliar part of the codebase
- Beginning a sprint or milestone

---

## 2. Code Review

Run mechanical checks, generate a self-review checklist, then request peer review.

### Steps

| Step | Tool                 | Purpose                                                                                                                                                                                        |
| ---- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `review_changes`     | Review code changes at configurable depth (`quick`, `standard`, `deep`). Quick runs diff analysis; standard adds self-review; deep runs the full 7-phase pipeline.                             |
| 2    | `create_self_review` | Generate a checklist-based review from a git diff. Checks harness constraints, custom rules, and diff patterns (file size, file count).                                                        |
| 3    | `run_code_review`    | Run the full 7-phase review pipeline: gate, mechanical checks, context scoping, parallel review agents, validation, deduplication, and output. Supports posting inline comments to GitHub PRs. |

### Example Sequence

```
1. review_changes(path: ".", depth: "quick")
   -> Fast diff analysis: 3 files changed, no layer violations, 1 missing JSDoc

2. create_self_review(path: ".", diff: "<git diff>")
   -> Checklist: constraint compliance, diff patterns, boundary checks

3. run_code_review(path: ".", diff: "<git diff>", comment: true, prNumber: 42, repo: "org/repo")
   -> Full pipeline: 2 critical findings, 1 suggestion, comments posted to PR
```

### When to Use

- Before opening a pull request (steps 1-2)
- During PR review (step 3 with `comment: true`)
- In CI pipelines (step 3 with `ci: true` for non-interactive output)

### Depth Selection

| Depth      | Use Case                                        | Time    |
| ---------- | ----------------------------------------------- | ------- |
| `quick`    | Fast sanity check during development            | Seconds |
| `standard` | Pre-PR self-review                              | ~30s    |
| `deep`     | Full review with threat modeling (`deep: true`) | ~60s    |

Auto-downgrade: diffs over 10,000 lines automatically downgrade from `deep` to `standard`.

---

## 3. Architecture Analysis

Query the knowledge graph, simulate failure propagation, predict future constraint violations, and track decay trends.

### Steps

| Step | Tool                   | Purpose                                                                                                                                                                |
| ---- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `query_graph`          | Query the knowledge graph using ContextQL. Traverse from root nodes outward, filtering by node and edge types. Returns the structural map of modules and dependencies. |
| 2    | `compute_blast_radius` | Simulate cascading failure propagation from a source node using probability-weighted BFS. Shows cumulative failure probability for each affected node.                 |
| 3    | `predict_failures`     | Predict which architectural constraints will break and when, based on decay trends and planned roadmap features. Requires at least 3 timeline snapshots.               |
| 4    | `get_decay_trends`     | Get architecture decay trends over time. Returns stability score history and per-category trend analysis from timeline snapshots.                                      |

### Example Sequence

```
1. query_graph(path: ".", rootNodeIds: ["src/services/auth"], includeEdges: ["imports", "calls"])
   -> Auth service depends on 4 modules, depended on by 7

2. compute_blast_radius(path: ".", file: "src/services/auth/index.ts", mode: "compact")
   -> 12 nodes affected, highest risk: api/routes.ts (0.82 probability)

3. predict_failures(path: ".", horizon: 12, category: "complexity")
   -> Complexity threshold breach predicted in 6 weeks at current trajectory

4. get_decay_trends(path: ".", last: 10)
   -> Stability: 87 -> 82 over last 10 snapshots, coupling trending up
```

### When to Use

- Before a major refactoring to understand impact
- During architecture reviews to identify hotspots
- Periodically to monitor architectural health trends

### Related Graph Tools

| Tool                | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `ask_graph`         | Natural language queries against the knowledge graph |
| `search_similar`    | Semantic similarity search across graph nodes        |
| `get_relationships` | Get relationships for a specific node                |
| `get_impact`        | Determine what is affected by changing a node        |
| `find_context_for`  | Find relevant context for a file or symbol           |
| `detect_anomalies`  | Detect structural anomalies in the graph             |

---

## 4. Security Check

Scan for vulnerabilities and validate dependency boundaries.

### Steps

| Step | Tool                 | Purpose                                                                                                                                                           |
| ---- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `run_security_scan`  | Run the built-in security scanner. Detects secrets, injection, XSS, weak crypto, and other vulnerabilities. Supports scanning specific files or the full project. |
| 2    | `check_dependencies` | Validate layer boundaries and detect circular dependencies. Catches architecture violations that can create security-relevant coupling.                           |

### Example Sequence

```
1. run_security_scan(path: ".", strict: true)
   -> 0 secrets, 1 potential XSS in src/ui/render.ts:42, 0 injection

2. check_dependencies(path: ".")
   -> 0 layer violations, 0 circular dependencies, 23 modules analyzed
```

### When to Use

- Before merging security-sensitive changes
- As part of CI checks (`harness ci check` runs both)
- After adding new dependencies or API endpoints

### Options

| Option   | Description                                           |
| -------- | ----------------------------------------------------- |
| `files`  | Scan only specific files (faster for targeted checks) |
| `strict` | Promote all warnings to errors                        |

---

## 5. Performance Analysis

Check structural complexity, review baselines, and identify critical paths.

### Steps

| Step | Tool                 | Purpose                                                                                                                                                                |
| ---- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `check_performance`  | Run performance checks: structural complexity, coupling metrics, and size budgets. Identifies modules that exceed thresholds.                                          |
| 2    | `get_perf_baselines` | Read current performance baselines from `.harness/perf/baselines.json`. Shows the established benchmark numbers for comparison.                                        |
| 3    | `get_critical_paths` | List performance-critical functions identified by `@perf-critical` annotations and graph inference. These are the hot paths where performance regressions matter most. |

### Example Sequence

```
1. check_performance(path: ".", type: "all")
   -> Structural: 2 files exceed complexity threshold
      Coupling: src/core/engine.ts has 14 dependents (high fan-in)
      Size: all modules within budget

2. get_perf_baselines(path: ".")
   -> 5 benchmarks tracked, last updated from commit abc123
      graph-query: 1,200 ops/sec, p99: 4.2ms

3. get_critical_paths(path: ".")
   -> 8 @perf-critical functions found
      src/graph/store/query.ts:runQuery (annotated)
      src/core/context/budget.ts:assembleBudget (graph-inferred, high fan-in)
```

### When to Use

- After changes to hot-path code
- When performance benchmarks regress
- During capacity planning or optimization sprints

### Performance Check Types

| Type         | What It Checks                          |
| ------------ | --------------------------------------- |
| `structural` | Cyclomatic complexity, nesting depth    |
| `coupling`   | Fan-in, fan-out, module dependencies    |
| `size`       | File size, export count, module budgets |
| `all`        | All of the above (default)              |

---

## Combining Workflows

Workflows compose naturally. Common combinations:

**Pre-merge checklist** (security + review + performance):

```
1. run_security_scan(path: ".", strict: true)
2. run_code_review(path: ".", diff: "<git diff>", ci: true)
3. check_performance(path: ".")
```

**Post-refactoring validation** (architecture + baseline):

```
1. query_graph(path: ".", rootNodeIds: ["<refactored-module>"])
2. compute_blast_radius(path: ".", file: "<changed-file>")
3. assess_project(path: ".", checks: ["deps", "perf", "lint"])
```

**Sprint health check** (trends + recommendations):

```
1. get_decay_trends(path: ".", last: 10)
2. recommend_skills(path: ".")
3. assess_project(path: ".", mode: "summary")
```

---

_Last Updated: 2026-04-18_
