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

A knowledge graph at `.harness/graph/` enables full analysis. If no graph exists,
the skill uses static analysis fallbacks (see Graph Availability section).
Run `harness scan` to enable graph-enhanced analysis.

### Graph Availability

Before starting, check if `.harness/graph/graph.json` exists.

**If graph exists:** Check staleness — compare `.harness/graph/metadata.json`
scanTimestamp against `git log -1 --format=%ct` (latest commit timestamp).
If graph is more than 10 commits behind (`git log --oneline <scanTimestamp>..HEAD | wc -l`),
run `harness scan` to refresh before proceeding. (Staleness sensitivity: **Medium**)

**If graph exists and is fresh (or refreshed):** Use graph tools as primary strategy.

**If no graph exists:** Output "Running without graph (run `harness scan` to
enable full analysis)" and use fallback strategies for all subsequent steps.

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

#### Fallback (without graph)

When no graph is available, use naming conventions, import parsing, and git history:

1. **Tier 1 — Filename convention matching**: For each changed file `foo.ts`, search for:
   - `foo.test.ts`, `foo.spec.ts` (same directory)
   - `__tests__/foo.ts`, `__tests__/foo.test.ts`
   - Test files in a parallel `tests/` directory mirroring the source path
2. **Tier 2 — Import-linked tests**: Parse test files' import statements (grep for `import.*from` in `*.test.*` and `*.spec.*` files). If a test file imports the changed file, it belongs in Tier 2 (if not already in Tier 1).
3. **Tier 3 — Co-change correlated tests**: Use `git log --format="%H" --name-only` to find test files that frequently change in the same commit as the target file. Files that co-change in >2 commits are co-change correlated.
4. **Rank**: Tier 1 = direct filename match, Tier 2 = import-linked tests, Tier 3 = co-change correlated tests. Output the same tiered format as the graph version.

> Fallback completeness: ~80% — naming conventions and imports catch most mappings; misses dynamic imports and indirect coverage.

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

## Harness Integration

- **`harness scan`** — Recommended before this skill for full graph-enhanced analysis. If graph is missing, skill uses naming convention and import parsing fallbacks.
- **`harness validate`** — Run after acting on findings to verify project health.
- **Graph tools** — This skill uses `query_graph`, `get_impact`, and `get_relationships` MCP tools.

## Success Criteria

- Tests prioritized into 3 tiers (Must Run, Should Run, Could Run)
- Executable run commands generated for quick and full test runs
- Coverage gaps flagged for changed files with no test coverage
- Report follows the structured output format
- All findings are backed by graph query evidence (with graph) or systematic static analysis (without graph)

## Rationalizations to Reject

These are common rationalizations that sound reasonable but lead to incorrect results. When you catch yourself thinking any of these, stop and follow the documented process instead.

| Rationalization                                                                                    | Why It Is Wrong                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Only the Tier 1 direct tests matter -- Tier 2 and Tier 3 are probably unnecessary"                | Tier 2 tests catch indirect breakage one hop away. A change to auth.ts breaks login.ts which breaks login.test.ts. Skipping Tier 2 misses exactly the regressions hardest to debug. |
| "The changed file has no tests, but that is not my concern -- I just advise on which tests to run" | Coverage gaps must be flagged. When a changed file has no test coverage, the advisor reports it. Silently producing an empty test list gives false confidence.                      |
| "The graph is stale but I will use it anyway since some data is better than no data"               | If the graph is more than 10 commits behind, refresh before proceeding. Staleness sensitivity is Medium for test advisor.                                                           |

## Examples

### Example: Selecting Tests for a Services Change

```
Input: git diff shows src/services/auth.ts and src/types/user.ts modified

1. PARSE    — 2 changed files identified (both .ts)
2. DISCOVER — get_impact(filePath="src/services/auth.ts")
              query_graph with depth 2 for transitive tests
              Tier 1: auth.test.ts, user.test.ts (direct imports)
              Tier 2: login.test.ts, verify.test.ts (one hop away)
              Tier 3: auth-flow.test.ts (co-change history)
3. PRIORITIZE — 5 tests across 3 tiers

Output:
  Tier 1 (must run): 2 tests
  Tier 2 (should run): 2 tests
  Tier 3 (could run): 1 test
  Quick command: npx vitest run auth.test.ts user.test.ts login.test.ts verify.test.ts
  Coverage gaps: none
```

## Gates

- **Graph preferred, fallback available.** If no graph exists, use naming conventions, import parsing, and git co-change analysis to identify relevant tests. Do not stop — produce the best test selection possible.
- **Always include Tier 1.** Direct test coverage is non-negotiable — always recommend running these (whether found via graph or naming conventions).

## Escalation

- **When changed file has no test coverage**: Flag as a gap: "No tests found for src/services/auth.ts — consider adding tests before merging."
- **When Tier 1 has >20 tests**: The changed file may be a hub. Suggest running Tier 1 in parallel or splitting the file.
