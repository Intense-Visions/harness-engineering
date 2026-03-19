# Harness Test Advisor

> Graph-based test selection. Answers: "I changed these files — what tests should I run?"

## When to Use

- Before pushing code — run only the tests that matter
- In CI — optimize test suite execution order
- When a test fails — understand which changes could have caused it
- When `on_pr` triggers fire
- NOT for writing tests (use harness-tdd)
- NOT for test quality analysis (out of scope)

## Prerequisites

A knowledge graph must exist at `.harness/graph/`. Run `harness scan` if no graph is available.
If the graph exists but code has changed since the last scan, re-run `harness scan` first — stale graph data leads to inaccurate results.

## Process

### Phase 1: PARSE — Identify Changed Files

1. **From diff**: Parse `git diff --name-only` to get changed file paths.
2. **From input**: Accept comma-separated file paths.
3. **Filter**: Only consider `.ts`, `.tsx`, `.js`, `.jsx` files (skip docs, config).

### Phase 2: DISCOVER — Find Related Tests via Graph

For each changed file, use graph traversal to find test files:

1. **Direct test coverage**: Use `get_impact` to find test files that import the changed file.

   ```
   get_impact(filePath="src/services/auth.ts")
   → tests: ["tests/services/auth.test.ts", "tests/integration/auth-flow.test.ts"]
   ```

2. **Transitive test coverage**: Use `query_graph` with depth 2 to find tests that import files that import the changed file.

   ```
   query_graph(rootNodeIds=["file:src/services/auth.ts"], maxDepth=2, includeEdges=["imports"], bidirectional=true)
   ```

3. **Co-change tests**: Check `co_changes_with` edges for test files that historically change alongside the modified files.

### Phase 3: PRIORITIZE — Rank and Generate Commands

Organize tests into three tiers:

**Tier 1 — Must Run** (direct coverage):
Tests that directly import or test the changed files. These are most likely to catch regressions.

**Tier 2 — Should Run** (transitive coverage):
Tests that cover code one hop away from the changed files. These catch indirect breakage.

**Tier 3 — Could Run** (related):
Tests in the same module or that co-change with the modified files. Lower probability of failure but worth running if time permits.

### Output

```
## Test Advisor Report

### Changed Files
- src/services/auth.ts (modified)
- src/types/user.ts (modified)

### Tier 1 — Must Run (direct coverage)
1. tests/services/auth.test.ts — imports auth.ts
2. tests/types/user.test.ts — imports user.ts

### Tier 2 — Should Run (transitive)
3. tests/routes/login.test.ts — imports routes/login.ts → imports auth.ts
4. tests/middleware/verify.test.ts — imports middleware/verify.ts → imports auth.ts

### Tier 3 — Could Run (related)
5. tests/integration/auth-flow.test.ts — same module, co-changes with auth.ts

### Quick Run Command
npx vitest run tests/services/auth.test.ts tests/types/user.test.ts tests/routes/login.test.ts tests/middleware/verify.test.ts

### Full Run Command (all tiers)
npx vitest run tests/services/auth.test.ts tests/types/user.test.ts tests/routes/login.test.ts tests/middleware/verify.test.ts tests/integration/auth-flow.test.ts
```

## Gates

- **No advice without graph.** If no graph exists, fall back to: "Run all tests in the same directory as changed files."
- **Always include Tier 1.** Direct test coverage is non-negotiable — always recommend running these.

## Escalation

- **When changed file has no test coverage**: Flag as a gap: "No tests found for src/services/auth.ts — consider adding tests before merging."
- **When Tier 1 has >20 tests**: The changed file may be a hub. Suggest running Tier 1 in parallel or splitting the file.
