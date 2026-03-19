# Harness Hotspot Detector

> Identify modules that represent structural risk via co-change and churn analysis.

## When to Use

- Weekly scheduled analysis to track codebase risk
- Before major refactoring — find the riskiest areas
- When investigating why changes keep breaking unrelated features
- NOT for finding dead code (use cleanup-dead-code)
- NOT for checking architecture rules (use enforce-architecture)

## Prerequisites

A knowledge graph must exist at `.harness/graph/` with git history ingested. Run `harness scan` if no graph is available.
If the graph exists but code has changed since the last scan, re-run `harness scan` first — stale graph data leads to inaccurate results.

## Process

### Phase 1: CO-CHANGE — Analyze Co-Change Patterns

Query the graph for `co_changes_with` edges (created by GitIngestor):

```
query_graph(rootNodeIds=[all file nodes], includeEdges=["co_changes_with"])
```

Identify file pairs that frequently change together:

- **Co-located pairs** (same directory): Normal — they share a concern.
- **Distant pairs** (different modules): Suspicious — may indicate hidden coupling.

Flag distant co-change pairs as potential hotspots.

### Phase 2: CHURN — Identify High-Churn Files

Query commit nodes to find files with the highest change frequency:

```
query_graph(rootNodeIds=[commit nodes], includeTypes=["commit", "file"], includeEdges=["co_changes_with"])
```

Rank files by:

- Total commit count touching the file
- Recent velocity (commits in last 30 days vs prior 30 days)
- Change size (total lines added + deleted)

High churn in shared utilities or core modules = high risk.

### Phase 3: COUPLING — Detect Hidden Dependencies

Cross-reference co-change data with structural data:

1. **High logical coupling, low structural coupling**: Files that always change together but have no `imports` edge between them. This indicates a hidden dependency — changing one requires changing the other, but the code doesn't express this relationship.

2. **High structural coupling, low logical coupling**: Files with `imports` edges but that rarely change together. This may indicate over-coupling — the import exists but the relationship is weak.

Use `get_relationships` to check structural edges between co-change pairs.

### Phase 4: REPORT — Generate Ranked Hotspot Report

```
## Hotspot Analysis Report

### Risk Hotspots (ranked by risk score)

1. **src/services/billing.ts** — Risk: HIGH
   - Churn: 23 commits (last 30 days: 8)
   - Co-changes with: src/types/invoice.ts (distant, 15 co-changes)
   - Hidden dependency: no imports edge to invoice.ts
   - Recommendation: Extract shared billing types or add explicit dependency

2. **src/utils/helpers.ts** — Risk: HIGH
   - Churn: 45 commits (highest in codebase)
   - Co-changes with: 12 different files across 4 modules
   - Recommendation: Split into domain-specific utilities to reduce blast radius

3. **src/middleware/auth.ts** — Risk: MEDIUM
   - Churn: 15 commits
   - Co-changes with: src/routes/login.ts (co-located, expected)
   - No hidden dependencies detected

### Summary
- Total hotspots detected: 5
- High risk: 2
- Medium risk: 3
- Hidden dependencies: 1
```

## Harness Integration

- **`harness scan`** — Must run before this skill to ensure graph is current.
- **`harness validate`** — Run after acting on findings to verify project health.
- **Graph tools** — This skill uses `query_graph`, `get_impact`, and `get_relationships` MCP tools.

## Success Criteria

- Hotspots ranked by composite risk score (churn + coupling)
- Hidden dependencies identified (high co-change, no structural edge)
- Co-change patterns detected and classified (co-located vs distant)
- Report follows the structured output format
- All findings are backed by graph query evidence, not heuristics

## Examples

### Example: Detecting Hotspots in a Growing Codebase

```
Input: Scheduled weekly analysis on project root

1. CO-CHANGE — query_graph for co_changes_with edges
               Found 4 distant co-change pairs
2. CHURN     — Ranked files by commit frequency
               billing.ts: 23 commits, helpers.ts: 45 commits
3. COUPLING  — Cross-referenced co-change vs imports edges
               billing.ts <-> invoice.ts: 15 co-changes, no imports edge
               (hidden dependency detected)
4. REPORT    — Ranked hotspots by risk score

Output:
  Hotspots: 5 total (2 high, 3 medium)
  Hidden dependencies: 1 (billing.ts <-> invoice.ts)
  Top recommendation: Extract shared billing types
```

## Gates

- **No analysis without graph + git data.** Both code structure and git history must be ingested.
- **No guessing at co-change patterns.** Use graph `co_changes_with` edges, not manual git log parsing.

## Escalation

- **When hidden dependencies found**: Recommend making the dependency explicit (add import) or extracting shared code.
- **When a single file has >30 commits**: Flag as critical hotspot requiring architectural attention.
