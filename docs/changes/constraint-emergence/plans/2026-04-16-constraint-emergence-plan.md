# Plan: Constraint Emergence from Patterns

**Date:** 2026-04-16 | **Spec:** docs/changes/constraint-emergence/proposal.md | **Tasks:** 8 | **Time:** ~35 min

## Goal

When `detect_constraint_emergence` is called, the system analyzes violation history to cluster recurring patterns and suggest new constraint rules with confidence tiers and evidence.

## Observable Truths (Acceptance Criteria)

1. When violations are passed to `ViolationHistoryManager.append()`, a timestamped snapshot is persisted to `.harness/arch/violation-history.json`
2. When `normalizeViolationPattern()` is called with a layer-violation detail, it returns the structural pattern with file-specific parts stripped
3. When `clusterViolations()` receives snapshots with identical `(category, pattern, scope)` tuples, it groups them into a single cluster
4. When `detectEmergentConstraints()` finds a cluster of 3+ violations within 4 weeks, it returns an `EmergentConstraintSuggestion` with valid `ConstraintRule`, confidence tier, and sample violations
5. When no cluster meets the threshold, `detectEmergentConstraints()` returns `{ suggestions: [] }`
6. The MCP tool `detect_constraint_emergence` returns structured JSON matching `EmergenceResultSchema`
7. `ViolationHistoryManager.prune(90)` removes snapshots older than 90 days
8. `pnpm test` passes for all new test files
9. `pnpm typecheck` passes
10. Tool count in server.test.ts and server-integration.test.ts is updated to 57

## File Map

- CREATE packages/core/src/architecture/violation-history.ts
- CREATE packages/core/src/architecture/normalize-pattern.ts
- CREATE packages/core/src/architecture/cluster-violations.ts
- CREATE packages/core/src/architecture/detect-emergence.ts
- CREATE packages/core/tests/architecture/violation-history.test.ts
- CREATE packages/core/tests/architecture/normalize-pattern.test.ts
- CREATE packages/core/tests/architecture/cluster-violations.test.ts
- CREATE packages/core/tests/architecture/detect-emergence.test.ts
- CREATE packages/cli/src/mcp/tools/constraint-emergence.ts
- CREATE packages/cli/tests/mcp/tools/constraint-emergence.test.ts
- MODIFY packages/core/src/architecture/types.ts (add emergence schemas)
- MODIFY packages/core/src/architecture/index.ts (add exports)
- MODIFY packages/cli/src/mcp/server.ts (register tool)
- MODIFY packages/cli/tests/mcp/server.test.ts (update tool count 56->57)
- MODIFY packages/cli/tests/mcp/server-integration.test.ts (update tool count 56->57)

## Tasks

### Task 1: Add emergence types to architecture types

**Depends on:** none | **Files:** packages/core/src/architecture/types.ts, packages/core/tests/architecture/types.test.ts

1. Add ViolationSnapshot, ViolationHistory, EmergentConstraintSuggestion, EmergenceResult schemas to types.ts
2. Run: `pnpm typecheck`
3. Commit: `feat(core): add constraint emergence type schemas`

### Task 2: Implement pattern normalization with TDD

**Depends on:** Task 1 | **Files:** packages/core/src/architecture/normalize-pattern.ts, packages/core/tests/architecture/normalize-pattern.test.ts

1. Create test file with cases for each category normalization
2. Run test — observe failure
3. Create normalize-pattern.ts with per-category rules
4. Run test — observe pass
5. Commit: `feat(core): add violation pattern normalization`

### Task 3: Implement violation history manager with TDD

**Depends on:** Task 1 | **Files:** packages/core/src/architecture/violation-history.ts, packages/core/tests/architecture/violation-history.test.ts

1. Create test file for load, append, prune operations
2. Run test — observe failure
3. Create violation-history.ts with ViolationHistoryManager class
4. Run test — observe pass
5. Commit: `feat(core): add violation history manager`

### Task 4: Implement clustering engine with TDD

**Depends on:** Task 2 | **Files:** packages/core/src/architecture/cluster-violations.ts, packages/core/tests/architecture/cluster-violations.test.ts

1. Create test file for clustering by (category, pattern, scope)
2. Run test — observe failure
3. Create cluster-violations.ts with clusterViolations()
4. Run test — observe pass
5. Commit: `feat(core): add violation clustering engine`

### Task 5: Implement emergence detector with TDD

**Depends on:** Task 3, Task 4 | **Files:** packages/core/src/architecture/detect-emergence.ts, packages/core/tests/architecture/detect-emergence.test.ts

1. Create test file for threshold detection, confidence tiers, empty results
2. Run test — observe failure
3. Create detect-emergence.ts with detectEmergentConstraints()
4. Run test — observe pass
5. Commit: `feat(core): add emergent constraint detection`

### Task 6: Export new modules from architecture index

**Depends on:** Task 5 | **Files:** packages/core/src/architecture/index.ts

1. Add exports for all new modules to architecture/index.ts
2. Run: `pnpm typecheck`
3. Commit: `feat(core): export constraint emergence modules`

### Task 7: Create MCP tool with TDD

**Depends on:** Task 6 | **Files:** packages/cli/src/mcp/tools/constraint-emergence.ts, packages/cli/tests/mcp/tools/constraint-emergence.test.ts

1. Create test file for tool handler (valid input, missing path, no history)
2. Run test — observe failure
3. Create constraint-emergence.ts with definition and handler
4. Run test — observe pass
5. Commit: `feat(cli): add detect_constraint_emergence MCP tool`

### Task 8: Register tool in server and update counts

**Depends on:** Task 7 | **Files:** packages/cli/src/mcp/server.ts, packages/cli/tests/mcp/server.test.ts, packages/cli/tests/mcp/server-integration.test.ts

1. Import and register tool in server.ts (TOOL_DEFINITIONS + TOOL_HANDLERS)
2. Update tool count 56->57 in both test files
3. Run: `pnpm test` (full suite)
4. Run: `pnpm typecheck`
5. Commit: `feat(cli): register constraint emergence tool in MCP server`
