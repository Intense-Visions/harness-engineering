# Plan: Remove Premature Deprecation Warnings

**Date:** 2026-03-26
**Spec:** docs/changes/remove-premature-deprecation-warnings/proposal.md
**Estimated tasks:** 1
**Estimated time:** 3 minutes

## Goal

Remove the misleading `console.warn` deprecation notices from `validateAgentsMap()` and `validateKnowledgeMap()` so that `harness validate` runs without spurious warnings.

## Observable Truths (Acceptance Criteria)

1. When `harness validate` runs, the system shall not emit any deprecation warnings containing "is deprecated" to stderr/stdout.
2. The system shall preserve all existing return types and behavior of `validateAgentsMap()` and `validateKnowledgeMap()` -- all 36 existing tests pass unchanged.
3. `harness validate` shall pass.

## File Map

- MODIFY `packages/core/src/context/agents-map.ts` (remove console.warn lines 156-158)
- MODIFY `packages/core/src/context/knowledge-map.ts` (remove console.warn lines 34-36)

**No test changes required.** All 5 test files were reviewed:

- `packages/core/tests/context/agents-map.test.ts` -- calls real `validateAgentsMap` but does not assert on console output
- `packages/core/tests/context/knowledge-map.test.ts` -- calls real `validateKnowledgeMap` but does not assert on console output
- `packages/core/tests/ci/check-orchestrator.test.ts` -- mocks `validateAgentsMap`, never hits the real warning
- `packages/core/tests/review/mechanical-checks.test.ts` -- mocks `validateAgentsMap`, never hits the real warning
- `packages/core/tests/review/mechanical-checks-parallel.test.ts` -- mocks `validateAgentsMap`, never hits the real warning

## Tasks

### Task 1: Remove console.warn deprecation calls and verify

**Depends on:** none
**Files:** `packages/core/src/context/agents-map.ts`, `packages/core/src/context/knowledge-map.ts`

1. Edit `packages/core/src/context/agents-map.ts` -- remove lines 156-158:

   ```typescript
   // REMOVE these 3 lines:
   console.warn(
     '[harness] validateAgentsMap() is deprecated. Use graph-based validation via Assembler.checkCoverage() from @harness-engineering/graph'
   );
   ```

   The function body should go directly from the closing `*/` of the JSDoc to the `// Read the file` comment.

2. Edit `packages/core/src/context/knowledge-map.ts` -- remove lines 34-36:

   ```typescript
   // REMOVE these 3 lines:
   console.warn(
     '[harness] validateKnowledgeMap() is deprecated. Use graph-based validation via Assembler.checkCoverage() from @harness-engineering/graph'
   );
   ```

   The function body should go directly from the opening `{` to `const agentsPath = join(rootDir, 'AGENTS.md');`.

3. Run tests from `packages/core`:

   ```bash
   npx vitest run tests/context/agents-map.test.ts tests/context/knowledge-map.test.ts tests/ci/check-orchestrator.test.ts tests/review/mechanical-checks.test.ts tests/review/mechanical-checks-parallel.test.ts
   ```

   Observe: all 36 tests pass.

4. Run: `harness validate`
   Observe: no deprecation warnings in output, validation passes.

5. Commit: `fix(core): remove premature deprecation warnings from context validators`
