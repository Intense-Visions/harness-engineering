### Option A: Dedicated Monorepo Package (`packages/symphony`)

**Summary:** Create a distinct package within the monorepo (`@harness-engineering/symphony`) to house all Orchestrator, Workspace Manager, and Agent Runner logic. The CLI will depend on this package to expose a daemon sub-command, while it will depend on `core` and `types`.

**How it works:**

1. Scaffold `packages/symphony` utilizing existing `tsconfig.json` project references.
2. Implement the Symphony state machine, polling loop, and Linear tracker integration within the new package.
3. Add a new CLI command `harness symphony start` that instantiates the Orchestrator algorithm.

**Pros:**

- Pristine separation of concerns; keeps `core` focused as a library and `cli` focused on I/O.
- Follows the established layered architecture where the daemon sits at the top.

**Cons:**

- Minor overhead of scaffolding and maintaining a new Turborepo workspace.
- Requires building new integration layers for Linear that might have been easier inside `mcp-server`.

**Effort:** Medium — Entails building out the state machine, API clients, and subprocess management from scratch within the new package.

**Risk:** Low — Well isolated. If it fails or is deprecated, it can be cleanly excised without impacting the rest of the toolkit.

**Best when:** You want a clean, decoupled implementation that strictly models the Symphony specification without tangling it with existing core utilities.

---

### Option B: Core Library Expansion + CLI Daemon

**Summary:** Implement the Orchestrator logic, Workspace Manager, and Tracker client inside `packages/core`, and place the actual infinite polling loop and timer mechanisms directly in `packages/cli`.

**How it works:**

1. Add new domain folders in `packages/core/src/symphony/` for the state machine and logic.
2. The `cli` parses configuration and calls `startSymphonyLoop()`, managing the setTimeouts and process state.

**Pros:**

- Fastest path to implementation with no new package scaffolding.
- Immediate access to all `core` validation and file-system utilities.

**Cons:**

- High severity — Dilutes the purpose of `packages/core`, turning it from a pure library into an orchestrator with side-effects (spawning processes, HTTP requests).
- Tightly couples daemon logic to the CLI.

**Effort:** Small — Leverages existing infrastructure rapidly.

**Risk:** Medium — Architectural drift. Could violate the "Architectural Rigidity" principle.

**Best when:** You are optimizing purely for speed of delivery and are willing to accept a slightly bloated `core` package.

---

### Option C: Converged Daemon via `mcp-server` Extension

**Summary:** Expand the existing `@harness-engineering/mcp-server` to serve a dual purpose: acting as the MCP interface for local tools AND performing the background Symphony orchestration.

**How it works:**

1. Import Orchestrator logic into `mcp-server`.
2. The server spins up an async polling loop upon initialization to pull issues from Linear and dispatch agents via subprocesses.

**Pros:**

- Consolidates all long-running processes into a single daemon.

**Cons:**

- High severity — Reverses the hierarchy. The MCP server is meant to _serve_ agents, whereas Symphony's Orchestrator _manages_ them. Merging them obfuscates their roles.
- The lifecycle of an MCP server (usually managed by Claude Desktop or similar) conflicts with an always-on Daemon polling Linear.

**Effort:** Large — Complex concurrency and lifecycle management.

**Risk:** High — Muddles the boundaries of the `mcp-server` and causes significant architectural friction with the 7 core principles.

**Best when:** You explicitly want to minimize the number of running services on a machine, regardless of architectural purity.

---

### Comparison Matrix

| Criterion        | Option A (New Package) | Option B (Core + CLI) | Option C (MCP Server) |
| ---------------- | ---------------------- | --------------------- | --------------------- |
| Complexity       | Medium                 | Low                   | High                  |
| Performance      | High                   | High                  | Medium                |
| Maintainability  | High                   | Medium                | Low                   |
| Effort to build  | Medium                 | Small                 | Large                 |
| Effort to change | Low                    | Medium                | High                  |
| Risk             | Low                    | Medium                | High                  |
| Fits constraints | Yes                    | Partially             | No                    |

---

### Recommendation

Based on the tight constraints of the **Harness Engineering layered architecture**, I strongly recommend **Option A**.

It protects the integrity of `packages/core` by keeping it a pure library, and it ensures the Symphony Orchestrator sits safely at the top of the dependency graph (depending on `core` and `types`), maintaining the one-way dependency rule. Options B and C introduce architectural drift that would violate the "Architectural Rigidity" principle defined in the project's standard.
