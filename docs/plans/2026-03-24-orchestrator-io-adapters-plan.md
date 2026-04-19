# Plan: Orchestrator I/O Adapters Implementation

**Date:** 2026-03-24
**Spec:** docs/changes/orchestrator/proposal.md
**Estimated tasks:** 10
**Estimated time:** 45 minutes

## Goal

Implement the I/O adapters for the `@harness-engineering/orchestrator` package to enable issue tracking (Roadmap), agent execution (Claude, Mock), workspace management, and workflow loading.

## Observable Truths (Acceptance Criteria)

1. **Ubiquitous:** All adapters shall implement the interfaces defined in `packages/types/src/orchestrator.ts`.
2. **Event-driven:** When `loadWorkflow` is called with a valid `harness.orchestrator.md`, it shall return a `WorkflowDefinition` with parsed YAML and template.
3. **State-driven:** `RoadmapTrackerAdapter` shall correctly identify blocked tasks based on markdown hierarchy.
4. **Ubiquitous:** `WorkspaceManager` shall prevent path traversal by sanitizing issue identifiers.
5. **Event-driven:** `PromptRenderer` shall fail if the Liquid template references undefined variables (Strict Mode).
6. **State-driven:** `MockBackend` shall simulate a multi-turn agent session with configurable token usage.
7. **Ubiquitous:** All implementations shall pass `harness validate`.

## File Map

- MODIFY `packages/orchestrator/package.json`
- CREATE `packages/orchestrator/src/prompt/renderer.ts`
- CREATE `packages/orchestrator/tests/prompt/renderer.test.ts`
- CREATE `packages/orchestrator/src/workflow/config.ts`
- CREATE `packages/orchestrator/src/workflow/loader.ts`
- CREATE `packages/orchestrator/tests/workflow/loader.test.ts`
- CREATE `packages/orchestrator/src/tracker/adapters/roadmap.ts`
- CREATE `packages/orchestrator/tests/tracker/roadmap.test.ts`
- CREATE `packages/orchestrator/src/workspace/manager.ts`
- CREATE `packages/orchestrator/src/workspace/hooks.ts`
- CREATE `packages/orchestrator/tests/workspace/manager.test.ts`
- CREATE `packages/orchestrator/src/agent/backends/mock.ts`
- CREATE `packages/orchestrator/src/agent/backends/claude.ts`
- MODIFY `packages/orchestrator/src/index.ts`

## Tasks

### Task 1: Add Orchestrator Dependencies

**Depends on:** none
**Files:** `packages/orchestrator/package.json`

1. Modify `packages/orchestrator/package.json` to add required dependencies:
   ```json
   "dependencies": {
     "@harness-engineering/types": "workspace:*",
     "liquidjs": "^10.10.0",
     "yaml": "^2.3.4",
     "chokidar": "^3.5.3"
   }
   ```
2. Run: `pnpm install`
3. Run: `harness validate`
4. Commit: `chore(orchestrator): add i/o dependencies`

### Task 2: Implement PromptRenderer

**Depends on:** Task 1
**Files:** `packages/orchestrator/src/prompt/renderer.ts`, `packages/orchestrator/tests/prompt/renderer.test.ts`

1. Create `packages/orchestrator/tests/prompt/renderer.test.ts` to verify strict rendering and variable injection.
2. Observe failure in `vitest`.
3. Create `packages/orchestrator/src/prompt/renderer.ts` using `Liquid` with `strictVariables: true`.
4. Run: `npx vitest packages/orchestrator/tests/prompt/renderer.test.ts`
5. Commit: `feat(orchestrator): implement PromptRenderer`

### Task 3: Implement Workflow Config & Loader

**Depends on:** Task 2
**Files:** `packages/orchestrator/src/workflow/config.ts`, `packages/orchestrator/src/workflow/loader.ts`, `packages/orchestrator/tests/workflow/loader.test.ts`

1. Create tests for parsing `harness.orchestrator.md` with frontmatter and template sections.
2. Implement `WorkflowConfig` validation logic in `config.ts`.
3. Implement `WorkflowLoader` in `loader.ts` using `yaml` and `fs.promises`.
4. Run tests: `npx vitest packages/orchestrator/tests/workflow/loader.test.ts`
5. Commit: `feat(orchestrator): implement WorkflowLoader`

### Task 4: Implement Roadmap Tracker Adapter

**Depends on:** Task 1
**Files:** `packages/orchestrator/src/tracker/adapters/roadmap.ts`, `packages/orchestrator/tests/tracker/roadmap.test.ts`

1. Create tests using a mock roadmap markdown file to verify issue extraction and blocker detection.
2. Implement `RoadmapTrackerAdapter` in `roadmap.ts`, leveraging `@harness-engineering/core` roadmap parser.
3. Run tests: `npx vitest packages/orchestrator/tests/tracker/roadmap.test.ts`
4. Commit: `feat(orchestrator): implement RoadmapTrackerAdapter`

### Task 5: Implement Workspace Manager & Hooks

**Depends on:** Task 1
**Files:** `packages/orchestrator/src/workspace/manager.ts`, `packages/orchestrator/src/workspace/hooks.ts`, `packages/orchestrator/tests/workspace/manager.test.ts`

1. Create tests for directory creation, sanitization, and shell hook execution.
2. Implement `WorkspaceManager` with path sanitization in `manager.ts`.
3. Implement hook execution with timeouts in `hooks.ts`.
4. Run tests: `npx vitest packages/orchestrator/tests/workspace/manager.test.ts`
5. Commit: `feat(orchestrator): implement WorkspaceManager and Hooks`

### Task 6: Implement Agent Backends (Mock & Claude)

**Depends on:** Task 1
**Files:** `packages/orchestrator/src/agent/backends/mock.ts`, `packages/orchestrator/src/agent/backends/claude.ts`

1. Implement `MockBackend` to simulate sessions for testing.
2. Implement `ClaudeBackend` using `child_process.spawn` for `claude -p --output-format json`.
3. Verify with integration tests using `MockBackend`.
4. Commit: `feat(orchestrator): implement AgentBackends`

### Task 7: Wire Orchestrator Exports

**Depends on:** Task 2-6
**Files:** `packages/orchestrator/src/index.ts`

1. Export all new adapters from `packages/orchestrator/src/index.ts`.
2. Run: `harness validate`
3. Commit: `feat(orchestrator): export i/o adapters`
