# Plan: Phase 2: Graph Integration (Blueprint)

**Date:** 2026-03-24
**Spec:** docs/changes/harness-blueprint/proposal.md
**Estimated tasks:** 7
**Estimated time:** 35 minutes

## Goal

Integrate the Harness Knowledge Graph into the blueprint generator to provide automated architectural mapping, dependency visualization, and complexity hotspot detection.

## Observable Truths (Acceptance Criteria)

1. When `.harness/graph/` exists, `harness blueprint` shall use `GraphScanner` to derive modules from the graph store.
2. The generated `index.html` shall include a "Complexity Hotspots" section showing high-risk functions.
3. The generated `index.html` shall include a "Module Dependencies" list derived from the graph.
4. The system shall fall back to basic `ProjectScanner` if no graph is detected.
5. `harness validate` passes.

## File Map

- MODIFY `packages/core/package.json`
- MODIFY `packages/core/src/blueprint/types.ts`
- CREATE `packages/core/src/blueprint/graph-scanner.ts`
- CREATE `packages/core/tests/blueprint/graph-scanner.test.ts`
- MODIFY `packages/core/src/blueprint/templates.ts`
- MODIFY `packages/core/src/blueprint/generator.ts`
- MODIFY `packages/cli/package.json`
- MODIFY `packages/cli/src/commands/blueprint.ts`
- MODIFY `packages/core/src/index.ts`

## Tasks

### Task 1: Add graph dependencies

**Depends on:** none
**Files:** `packages/core/package.json`, `packages/cli/package.json`

1. Add `"@harness-engineering/graph": "workspace:*"` to `dependencies` in `packages/core/package.json`.
2. Add `"@harness-engineering/graph": "workspace:*"` to `dependencies` in `packages/cli/package.json`.
3. Run `pnpm install`.
4. Run `harness validate`.
5. Commit: `feat(blueprint): add graph dependencies`

### Task 2: Update Blueprint types

**Depends on:** Task 1
**Files:** `packages/core/src/blueprint/types.ts`

1. Add `Hotspot` and `ModuleDependency` interfaces:

```typescript
export interface Hotspot {
  file: string;
  function: string;
  score: number;
}

export interface ModuleDependency {
  from: string;
  to: string;
}

export interface BlueprintData {
  projectName: string;
  generatedAt: string;
  modules: BlueprintModule[];
  hotspots: Hotspot[];
  dependencies: ModuleDependency[];
}
```

2. Commit: `feat(blueprint): update types for graph data`

### Task 3: Implement GraphScanner

**Depends on:** Task 2
**Files:** `packages/core/src/blueprint/graph-scanner.ts`, `packages/core/tests/blueprint/graph-scanner.test.ts`

1. Create `GraphScanner` using `GraphStore` and `GraphComplexityAdapter`.
2. Map graph `module` nodes to `BlueprintModule`.
3. Extract `imports` edges between modules.
4. Run: `npx vitest run packages/core/tests/blueprint/graph-scanner.test.ts`
5. Commit: `feat(blueprint): implement GraphScanner`

### Task 4: Update Generator to handle graph data

**Depends on:** Task 3
**Files:** `packages/core/src/blueprint/generator.ts`

1. Update `BlueprintGenerator` to accept `BlueprintData` with hotspots and dependencies.
2. Ensure defaults are provided for backward compatibility with `ProjectScanner`.
3. Commit: `feat(blueprint): update generator for graph data`

### Task 5: Update Templates for Visuals

**Depends on:** Task 4
**Files:** `packages/core/src/blueprint/templates.ts`

1. Add EJS sections for Hotspots and Dependency list.
2. Add basic CSS for hotspot badges.
3. Commit: `feat(blueprint): update templates for graph insights`

### Task 6: Export GraphScanner from Core

**Depends on:** Task 3
**Files:** `packages/core/src/index.ts`

1. Export `GraphScanner` from `packages/core/src/index.ts`.
2. Commit: `feat(blueprint): export GraphScanner from core`

### Task 7: Wire Graph Detection into CLI

**Depends on:** Task 6
**Files:** `packages/cli/src/commands/blueprint.ts`

1. Import `loadGraph` and `GraphScanner`.
2. Check if `.harness/graph/` exists.
3. If yes, `loadGraph` and use `GraphScanner`.
4. Run: `harness validate`.
5. Commit: `feat(blueprint): wire graph detection into CLI blueprint command`

## Harness Integration

- **`harness validate`** — Run after each task.
- **Plan location** — `docs/plans/2026-03-24-graph-integration-plan.md`.
- **Handoff** — `.harness/sessions/changes--harness-blueprint--proposal/handoff.json`.
