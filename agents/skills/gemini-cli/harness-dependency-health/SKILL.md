# Harness Dependency Health

> Analyze structural health of the codebase and surface problems before they become incidents.

## When to Use

- Weekly scheduled health check on the codebase
- Before major refactoring — understand current structural health
- When onboarding to a new project — assess codebase quality
- NOT for checking layer violations (use enforce-architecture)
- NOT for finding dead code (use cleanup-dead-code)

## Prerequisites

A knowledge graph must exist at `.harness/graph/`. Run `harness scan` if no graph is available.
If the graph exists but code has changed since the last scan, re-run `harness scan` first — stale graph data leads to inaccurate results.

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

- **`harness scan`** — Must run before this skill to ensure graph is current.
- **`harness validate`** — Run after acting on findings to verify project health.
- **Graph tools** — This skill uses `query_graph`, `get_relationships`, and `check_dependencies` MCP tools.

## Success Criteria

- Health score computed on 0-100 scale with letter grade (A-F)
- All five structural metrics gathered (hubs, orphans, cycles, deep chains, cohesion)
- Recommendations are specific and actionable (name files, suggest concrete fixes)
- Report follows the structured output format
- All findings are backed by graph query evidence, not heuristics

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

- **No analysis without graph.** If no graph exists, stop and instruct to run `harness scan`.
- **No guessing.** All metrics must come from graph queries, not heuristics.

## Escalation

- **When score is F (<40)**: Flag as critical and recommend immediate architectural review.
- **When graph is stale**: Warn and suggest re-scanning before trusting results.
