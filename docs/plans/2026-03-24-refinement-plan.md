# Plan: Blueprint Refinement

**Date:** 2026-03-24
**Spec:** docs/changes/harness-blueprint/proposal.md
**Estimated tasks:** 3
**Estimated time:** 15 minutes

## Goal

Refine the generated Blueprint HTML with project design tokens and perform general clean up.

## Observable Truths (Acceptance Criteria)

1. `index.html` uses design tokens (colors, typography) defined in the project.
2. Blueprint viewer has improved styling for better readability.
3. Code clean-up and optimizations performed on the Blueprint generator.

## File Map

- MODIFY packages/core/src/blueprint/templates.ts
- MODIFY packages/core/src/blueprint/generator.ts
- MODIFY packages/core/tests/blueprint/generator.test.ts

## Tasks

### Task 1: Update Blueprint template with token-based styling

**Depends on:** none
**Files:** packages/core/src/blueprint/templates.ts

1. Modify `packages/core/src/blueprint/templates.ts` to replace hardcoded styles with CSS variables referencing design tokens.
2. Run: `harness validate`
3. Commit: `refactor(blueprint): apply design tokens to blueprint viewer`

### Task 2: Optimize Blueprint Generator content pipeline

**Depends on:** Task 1
**Files:** packages/core/src/blueprint/generator.ts

1. Optimize the `BlueprintGenerator` to ensure efficient content pipeline execution.
2. Run: `harness validate`
3. Commit: `perf(blueprint): optimize content pipeline`

### Task 3: Update and add tests for refined Blueprint

**Depends on:** Task 2
**Files:** packages/core/tests/blueprint/generator.test.ts

1. Update tests to verify the new styling and refinements.
2. Run: `npx vitest run packages/core/tests/blueprint/generator.test.ts`
3. Run: `harness validate`
4. Commit: `test(blueprint): update tests for refinement`
