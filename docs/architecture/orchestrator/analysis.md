## Codebase Analysis: Symphony Integration

### Current Patterns

- **Layered Architecture:** Strict one-way dependencies (types -> core -> cli/graph).
- **Error Handling:** Explicit `Result<T, E>` pattern for all operations that may fail.
- **Type Safety:** TypeScript strict mode, with all types declared in `packages/types`.
- **Monorepo Structure:** pnpm workspaces with discrete packages for core logic, CLI, and graph.
- **Configuration:** Repo-level configuration validation (already present in `core` and `cli`).

### Integration Points

- **packages/types:** Must be augmented with Symphony's domain models: `Issue`, `AgentSession`, `OrchestratorState`, `WorkflowConfig`.
- **packages/core:** Can be utilized for workflow front matter parsing, Result<T,E> validation, and file path discovery (`5.1 File Discovery and Path Resolution`).
- **packages/cli:** The natural entry point for the daemon. A new command `harness symphony start` would initialize the orchestrator and poll loop.
- **packages/graph:** Can enrich the workspace generation process or provide deep context to the coding agent.
- **New Package (Proposed):** A new `packages/symphony` or `packages/orchestrator` package to house the State Machine, Poll Loop, and Agent Runner, keeping `core` and `cli` focused.

### Technical Debt / Architectural Constraints

- **Concurrency & Threads:** Node.js is single-threaded. The orchestrator tick loop must be non-blocking and use asynchronous `child_process.spawn` for Agent Runners.
- **Process Isolation:** The Orchestrator must manage child subprocesses (coding agents) robustly, avoiding zombie processes if the daemon crashes.
- **State Management:** The spec requires an in-memory State Machine with periodic reconciliation against the Issue Tracker. There is currently no persistent database in the core architecture outside of the `graph` LokiJS store, meaning state must remain strictly in-memory or leverage `graph`.

### Relevant Files

- `packages/types/src/index.ts`: Will need all new interfaces.
- `packages/cli/src/index.ts`: Where the new daemon command will be registered.
- `packages/core/src/config/`: Likely location for extending configuration resolution semantics (Spec Section 6).
