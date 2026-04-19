# Plan: Orchestrator Phase 4 — Observability & CLI

**Date:** 2026-03-24
**Spec:** docs/changes/orchestrator/proposal.md
**Estimated tasks:** 9
**Estimated time:** 45 minutes

## Goal

Implement the observability layer (Ink TUI + HTTP API), the `harness orchestrator run` CLI command, and the initial wiring for Linear GraphQL extensions.

## Observable Truths (Acceptance Criteria)

1. **Ubiquitous:** `harness orchestrator run` starts the daemon and launches the Ink TUI.
2. **State-driven:** While the orchestrator is running, `GET /api/v1/state` returns the full orchestrator snapshot as JSON.
3. **Event-driven:** When an agent updates its status, the TUI agents table reflects the change within 500ms.
4. **Ubiquitous:** The system supports graceful shutdown (terminating agents) on `SIGTERM` or `Ctrl+C`.
5. **Ubiquitous:** A default `harness.orchestrator.md` template is available for new orchestrator setups.
6. **Ubiquitous:** The `linear_graphql` tool extension interface is defined and conditionally loaded.

## File Map

- MODIFY `packages/orchestrator/package.json`
- MODIFY `packages/orchestrator/tsconfig.json`
- CREATE `packages/orchestrator/src/server/http.ts`
- CREATE `packages/orchestrator/src/tui/components/Header.tsx`
- CREATE `packages/orchestrator/src/tui/components/AgentsTable.tsx`
- CREATE `packages/orchestrator/src/tui/components/Stats.tsx`
- CREATE `packages/orchestrator/src/tui/app.tsx`
- MODIFY `packages/orchestrator/src/orchestrator.ts`
- CREATE `packages/cli/src/commands/orchestrator.ts`
- MODIFY `packages/cli/src/index.ts`
- CREATE `templates/orchestrator/harness.orchestrator.md`

## Tasks

### Task 1: Setup Observability Dependencies

**Depends on:** none
**Files:** `packages/orchestrator/package.json`, `packages/orchestrator/tsconfig.json`

1. Add `ink`, `react`, `ink-table`, and `@types/react` to `packages/orchestrator/package.json`.
2. Enable JSX in `packages/orchestrator/tsconfig.json`.
3. Run: `pnpm install`
4. Run: `harness validate`
5. Commit: `chore(orchestrator): add observability dependencies`

### Task 2: Implement HTTP Server

**Depends on:** Task 1
**Files:** `packages/orchestrator/src/server/http.ts`, `packages/orchestrator/src/orchestrator.ts`

1. Create a simple Node.js HTTP server in `src/server/http.ts` that takes an `Orchestrator` instance and exposes `GET /api/v1/state`.
2. Update `Orchestrator` class to start the server if `server.port` is configured.
3. Verify with a test script or `curl` during execution.
4. Commit: `feat(orchestrator): implement basic HTTP API`

### Task 3: Add EventEmitter to Orchestrator

**Depends on:** Task 2
**Files:** `packages/orchestrator/src/orchestrator.ts`

1. Make `Orchestrator` extend `EventEmitter`.
2. Emit a `state_change` event at the end of each `tick()`.
3. Emit `agent_event` when a background agent task yields an event.
4. Commit: `feat(orchestrator): add event emitter for state updates`

### Task 4: Implement TUI Components

**Depends on:** Task 1
**Files:** `packages/orchestrator/src/tui/components/Header.tsx`, `packages/orchestrator/src/tui/components/AgentsTable.tsx`, `packages/orchestrator/src/tui/components/Stats.tsx`

1. Create stateless React components for the TUI using `ink`.
2. `Header`: Shows title and uptime.
3. `Stats`: Shows token totals and concurrency.
4. `AgentsTable`: Lists running issues, their phase, and recent message.
5. Commit: `feat(orchestrator): implement Ink TUI components`

### Task 5: Implement Main TUI App

**Depends on:** Task 3, Task 4
**Files:** `packages/orchestrator/src/tui/app.tsx`

1. Create the main `Dashboard` component that hooks into `Orchestrator` events and updates local state.
2. Render the components from Task 4.
3. Commit: `feat(orchestrator): implement TUI Dashboard`

### Task 6: Implement CLI Command

**Depends on:** Task 5
**Files:** `packages/cli/src/commands/orchestrator.ts`, `packages/cli/src/index.ts`

1. Create `createOrchestratorCommand` in `packages/cli/src/commands/orchestrator.ts` using `commander`.
2. Load `harness.orchestrator.md`, initialize `Orchestrator`, and launch the TUI.
3. Register the command in `packages/cli/src/index.ts`.
4. Commit: `feat(cli): add harness orchestrator run command`

### Task 7: Define harness.orchestrator.md Template

**Depends on:** none
**Files:** `templates/orchestrator/harness.orchestrator.md`

1. Create a default `harness.orchestrator.md` with frontmatter and a basic prompt template.
2. Commit: `feat(orchestrator): add default workflow template`

### Task 8: Wire Linear GraphQL Interface (Stub)

**Depends on:** none
**Files:** `packages/orchestrator/src/tracker/extensions/linear.ts`

1. Define the `linear_graphql` extension interface as a stub to satisfy Phase 4 requirements.
2. Commit: `feat(orchestrator): wire linear_graphql extension stub`

### Task 9: Final Validation & E2E

**Depends on:** Task 1-8
**Files:** none

1. Run `harness validate` project-wide.
2. Verify `harness orchestrator run` works with a mock workflow.
3. Commit: `test(orchestrator): verify phase 4 implementation`
