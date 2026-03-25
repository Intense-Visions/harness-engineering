# Plan: Impact Lab for Blueprint

**Date:** 2026-03-24
**Spec:** docs/changes/harness-blueprint/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Implement the Impact Lab feature in the blueprint generator, enabling interactive dependency visualization via `mcp_harness_get_impact`.

## Observable Truths (Acceptance Criteria)

1. The generated blueprint HTML includes a functional Impact Lab component.
2. Interacting with the Impact Lab (toggling a file) updates the list of downstream dependencies.
3. The dependency list is populated by calling `mcp_harness_get_impact`.
4. `harness validate` passes.

## File Map

- MODIFY packages/core/src/blueprint/impact-lab-generator.ts
- MODIFY packages/core/src/blueprint/template.html
- CREATE packages/core/src/blueprint/impact-lab.test.ts

## Tasks

### Task 1: Create Impact Lab Test Scaffolding

**Depends on:** none
**Files:** packages/core/src/blueprint/impact-lab.test.ts

1. Create test: verify impact lab data structure generation.
2. Run test: observe failure.
3. Commit: `feat(blueprint): add impact lab tests`

### Task 2: Implement Data Fetcher for Impact Lab

**Files:** packages/core/src/blueprint/impact-lab-generator.ts

1. Implement `generateImpactData` to utilize `mcp_harness_get_impact`.
2. Run: `harness validate`
3. Commit: `feat(blueprint): implement impact data fetcher`

### Task 3: Integrate into HTML Template

**Files:** packages/core/src/blueprint/template.html

1. Add Impact Lab UI component to template.
2. Wire up toggle logic in JS.
3. Commit: `feat(blueprint): add impact lab UI to template`

### Task 4: Verify Full Flow

[checkpoint:human-verify]

1. Run generator against a test codebase.
2. Verify Impact Lab interactive exercise works.
3. Commit: `test(blueprint): verify impact lab flow`

### Task 5: Final Validation

1. Run: `harness validate`
2. Commit: `chore(blueprint): impact lab implementation complete`
