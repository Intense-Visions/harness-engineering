# Harness Impact Analysis

> Graph-based impact analysis. Answers: "if I change X, what breaks?"

## When to Use

- Before merging a PR — understand the blast radius of changes
- When planning a refactoring — know what will be affected
- When a test fails — trace backwards to find what change caused it
- When `on_pr` triggers fire
- NOT for understanding code (use harness-onboarding or harness-code-review)
- NOT for finding dead code (use cleanup-dead-code)

## Prerequisites

A knowledge graph must exist at `.harness/graph/`. Run `harness scan` if no graph is available.

## Process

### Phase 1: IDENTIFY — Determine Changed Files

1. **From diff**: If a git diff is available, parse it to extract changed file paths.
2. **From input**: If file paths are provided directly, use those.
3. **From git**: If neither, use `git diff --name-only HEAD~1` to get recent changes.

### Phase 2: ANALYZE — Query Graph for Impact

For each changed file:

1. **Direct dependents**: Use `get_impact` MCP tool to find all files that import or call the changed file.

   ```
   get_impact(filePath="src/services/auth.ts")
   → tests: [auth.test.ts, integration.test.ts]
   → docs: [auth-guide.md]
   → code: [routes/login.ts, middleware/verify.ts, ...]
   ```

2. **Transitive dependents**: Use `query_graph` with depth 3 to find indirect consumers.

   ```
   query_graph(rootNodeIds=["file:src/services/auth.ts"], maxDepth=3, includeEdges=["imports", "calls"])
   ```

3. **Documentation impact**: Use `get_relationships` to find `documents` edges pointing to changed nodes.

4. **Test coverage**: Identify test files connected via `imports` edges. Flag changed files with no test coverage.

### Phase 3: ASSESS — Risk Assessment and Report

1. **Impact score**: Calculate based on:
   - Number of direct dependents (weight: 3x)
   - Number of transitive dependents (weight: 1x)
   - Whether affected code includes entry points (weight: 5x)
   - Whether tests exist for the changed code (no tests = higher risk)

2. **Risk tiers**:
   - **Critical** (score > 50): Changes affect entry points or >20 downstream files
   - **High** (score 20-50): Changes affect multiple modules or shared utilities
   - **Medium** (score 5-20): Changes affect a few files within the same module
   - **Low** (score < 5): Changes are isolated with minimal downstream impact

3. **Output report**:

   ```
   ## Impact Analysis Report

   ### Changed Files
   - src/services/auth.ts (modified)
   - src/types/user.ts (modified)

   ### Impact Summary
   - Direct dependents: 8 files
   - Transitive dependents: 23 files
   - Affected tests: 5 files
   - Affected docs: 2 files
   - Risk tier: HIGH

   ### Affected Tests (must run)
   1. tests/services/auth.test.ts (direct)
   2. tests/routes/login.test.ts (transitive)
   3. tests/integration/auth-flow.test.ts (transitive)

   ### Affected Documentation (may need update)
   1. docs/auth-guide.md → documents src/services/auth.ts
   2. docs/api-reference.md → documents src/types/user.ts

   ### Downstream Consumers
   1. src/routes/login.ts — imports auth.ts
   2. src/middleware/verify.ts — imports auth.ts
   3. src/routes/signup.ts — imports user.ts (transitive via auth.ts)
   ```

## Gates

- **No analysis without graph.** If no graph exists at `.harness/graph/`, stop and instruct the user to run `harness scan`.
- **No risk assessment without data.** Do not guess at impact — use graph queries. If graph data is incomplete, state what is missing.

## Escalation

- **When graph is stale**: If the graph's last scan timestamp is older than the most recent commit, warn that results may be incomplete and suggest re-scanning.
- **When impact is critical**: If risk tier is Critical, recommend a thorough code review and full test suite run before merging.
