# Harness Dependency Health

> Analyze structural health of the codebase and surface problems before they become incidents.

## When to Use

- Weekly scheduled health check on the codebase
- Before major refactoring — understand current structural health
- When onboarding to a new project — assess codebase quality
- NOT for checking layer violations (use enforce-architecture)
- NOT for finding dead code (use cleanup-dead-code)

## Prerequisites

A knowledge graph at `.harness/graph/` enables full analysis. If no graph exists,
the skill uses static analysis fallbacks (see Graph Availability section).
Run `harness scan` to enable graph-enhanced analysis.

### Graph Availability

Before starting, check if `.harness/graph/graph.json` exists.

**If graph exists:** Check staleness — compare `.harness/graph/metadata.json`
scanTimestamp against `git log -1 --format=%ct` (latest commit timestamp).
If graph is more than 2 commits behind (`git log --oneline <scanTimestamp>..HEAD | wc -l`),
run `harness scan` to refresh before proceeding. (Staleness sensitivity: **High**)

**If graph exists and is fresh (or refreshed):** Use graph tools as primary strategy.

**If no graph exists:** Output "Running without graph (run `harness scan` to
enable full analysis)" and use fallback strategies for all subsequent steps.

## Process

### Phase 1: METRICS — Compute Graph Structural Metrics

Query the graph for five key structural indicators:

1. **Hub detection**: Find nodes with high fan-in (>10 inbound `imports` edges).

   ```
   query_graph(rootNodeIds=[all file nodes], includeEdges=["imports"])
   ```

   Hubs are single points of failure — changes to them have outsized blast radius.

2. **Orphan detection**: Find file nodes with zero inbound `imports` edges that are not entry points.

   ```
   get_relationships(nodeId=<file>, direction="inbound")
   ```

   Orphans may be dead code or missing from the module system.

3. **Cycle detection**: Use `check_dependencies` to find circular import chains.
   Cycles create fragile coupling — any change in the cycle affects all members.

4. **Deep chain detection**: Find import chains longer than N hops (default: 7).

   ```
   query_graph(rootNodeIds=[entry points], maxDepth=10, includeEdges=["imports"])
   ```

   Deep chains are fragile — a change at the bottom propagates unpredictably.

5. **Module cohesion**: For each module (directory), count internal vs external edges. Low internal cohesion (many external edges, few internal) suggests misplaced code.

#### Fallback (without graph)

When no graph is available, use static analysis to approximate structural metrics:

1. **Build adjacency list**: Grep all source files for `import`/`require` statements. Parse each to extract the imported path. Build an adjacency list mapping each file to its imports.
2. **Hub detection**: From the adjacency list, count inbound edges per file. Files with >10 importers are hubs.
3. **Orphan detection**: Files with zero inbound edges that are not entry points (not `index.*`, not in `package.json` main/exports). Use glob to find all source files, then subtract those that appear as import targets.
4. **Cycle detection**: Run DFS on the adjacency list. When a back-edge is found, report the cycle path.
5. **Deep chain detection**: From entry points, DFS to find the longest import chain. Report chains exceeding 7 hops.
6. **Module cohesion (approximate)**: For each directory, count imports that stay within the directory (internal) vs imports that leave it (external). Cohesion = internal / (internal + external).
7. **Run `check_dependencies` CLI** — this works without a graph and can detect layer violations.

> Fallback completeness: ~60% — cannot compute transitive depth beyond what import parsing reveals; coupling metrics are approximate.

6. **Detect structural anomalies**: Run `detect_anomalies` to identify structural irregularities (orphaned modules, unusual coupling patterns) that indicate dependency health issues.

### Phase 2: SCORE — Calculate Health Score

Compute a weighted health score (0-100):

| Metric            | Weight | Scoring                                   |
| ----------------- | ------ | ----------------------------------------- |
| Hubs (>10 fan-in) | 25%    | 0 hubs = 100, 1-3 = 70, 4-6 = 40, >6 = 10 |
| Orphans           | 20%    | 0 = 100, 1-5 = 80, 6-15 = 50, >15 = 20    |
| Cycles            | 25%    | 0 = 100, 1 = 60, 2-3 = 30, >3 = 0         |
| Deep chains (>7)  | 15%    | 0 = 100, 1-3 = 70, >3 = 30                |
| Cohesion (avg)    | 15%    | >0.7 = 100, 0.5-0.7 = 70, <0.5 = 30       |

**Grades**: A (90-100), B (75-89), C (60-74), D (40-59), F (<40)

Check `get_decay_trends` to see how dependency health metrics have changed over time and whether current trends are improving or degrading.

### Phase 3: RECOMMEND — Generate Recommendations

For each problem found, generate a specific, actionable recommendation:

- **Hubs**: "Split `src/utils/helpers.ts` (14 importers) into domain-specific utilities"
- **Orphans**: "Remove `src/legacy/old-parser.ts` (0 importers, not an entry point)"
- **Cycles**: "Break cycle A→B→C→A by extracting shared types to `src/types/shared.ts`"
- **Deep chains**: "Consider flattening chain: entry→A→B→C→D→E→F→G (8 hops)"
- **Low cohesion**: "Module `src/services/` has 80% external edges — consider splitting"

### Output

```
## Dependency Health Report

### Score: B (78/100)

### Metrics
| Metric | Count | Score |
|--------|-------|-------|
| Hubs (>10 fan-in) | 2 | 70/100 |
| Orphans | 3 | 80/100 |
| Cycles | 0 | 100/100 |
| Deep chains (>7) | 1 | 70/100 |
| Module cohesion | 0.62 avg | 70/100 |

### Top Issues
1. **Hub**: src/utils/helpers.ts — 14 importers (split recommended)
2. **Hub**: src/types/index.ts — 12 importers (acceptable for type barrel)
3. **Orphan**: src/legacy/old-parser.ts — 0 importers
4. **Deep chain**: entry→auth→user→db→pool→config→env→loader (8 hops)

### Recommendations
1. Split src/utils/helpers.ts into domain-specific modules
2. Investigate src/legacy/old-parser.ts for removal
3. Flatten auth chain by having auth import db directly
```

## Harness Integration

- **`harness scan`** — Recommended before this skill for full graph-enhanced analysis. If graph is missing, skill uses static analysis fallbacks.
- **`harness validate`** — Run after acting on findings to verify project health.
- **Graph tools** — This skill uses `query_graph`, `get_relationships`, and `check_dependencies` MCP tools.

## Success Criteria

- Health score computed on 0-100 scale with letter grade (A-F)
- All five structural metrics gathered (hubs, orphans, cycles, deep chains, cohesion)
- Recommendations are specific and actionable (name files, suggest concrete fixes)
- Report follows the structured output format
- All findings are backed by graph query evidence (with graph) or systematic static analysis (without graph)

## Rationalizations to Reject

These are common rationalizations that sound reasonable but lead to incorrect results. When you catch yourself thinking any of these, stop and follow the documented process instead.

| Rationalization                                                                                                  | Why It Is Wrong                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| "There are a few orphan files but they are probably test fixtures or configs, so I will skip investigating them" | Orphan detection explicitly excludes entry points. Files with zero inbound imports that are not entry points must be investigated.            |
| "The cycle is between two closely related files, so it is not really a problem"                                  | Cycles create fragile coupling where any change in the cycle affects all members. Even "related" files should not have circular dependencies. |
| "The health score is a B, which is good enough -- no need to act on the recommendations"                         | A hub with 14 importers is a single point of failure. "Good enough" scores mask specific structural risks that compound over time.            |

## Examples

### Example: Weekly Health Check on Monorepo

```
Input: Scheduled weekly run on project root

1. METRICS    — query_graph for hubs: 2 found (helpers.ts, index.ts)
                get_relationships for orphans: 3 found
                check_dependencies for cycles: 0 found
                query_graph for deep chains: 1 found (8 hops)
                Module cohesion average: 0.62
2. SCORE      — Weighted score: 78/100 (Grade: B)
3. RECOMMEND  — "Split helpers.ts (14 importers) into domain modules"
                "Investigate old-parser.ts for removal (0 importers)"
                "Flatten auth chain — 8 hops exceeds threshold"

Output:
  Score: B (78/100)
  Top issues: 2 hubs, 3 orphans, 1 deep chain
  3 actionable recommendations generated
```

## Gates

- **Graph preferred, fallback available.** If no graph exists, use fallback strategies (import parsing, DFS cycle detection, hub/orphan identification). Do not stop — produce the best analysis possible.
- **Systematic analysis required.** All metrics must come from graph queries (with graph) or systematic import parsing (without graph). Do not guess — parse actual import statements.

## Escalation

- **When score is F (<40)**: Flag as critical and recommend immediate architectural review.
- **When graph is stale**: Warn and suggest re-scanning before trusting results.
