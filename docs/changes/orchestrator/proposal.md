# Orchestrator Package Implementation

**Keywords:** orchestrator, daemon, state-machine, dispatch, workspace, agent-backend, roadmap-tracker, tui, polling, reconciliation

## Overview

Implement `@harness-engineering/orchestrator` as a new top-layer monorepo package that runs as a long-lived daemon, polling issue trackers for work, dispatching coding agents in isolated per-issue workspaces, and providing operator observability via TUI and HTTP API.

### Goals

- Poll a configured issue tracker on a fixed cadence and dispatch work with bounded concurrency
- Maintain a single authoritative in-memory state for dispatch, retries, and reconciliation
- Create deterministic per-issue workspaces and preserve them across runs
- Stop active runs when issue state changes make them ineligible
- Recover from transient failures with exponential backoff
- Load runtime behavior from a repository-owned `WORKFLOW.md`
- Expose operator observability via Ink-based TUI and optional HTTP JSON API
- Support swappable coding agents via the `AgentBackend` interface

### Scope

Full required conformance per ADR-001 plus key extensions: HTTP server, Roadmap adapter, `linear_graphql` tool. Linear, GitHub, and Jira adapters deferred to follow-up work.

### Reference

Full specification: `.harness/architecture/orchestrator/ADR-001.md`

---

## Decisions

| #   | Decision                                                       | Rationale                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Scope: Full required conformance + key extensions**          | HTTP server, Roadmap adapter, and `linear_graphql` tool included from day one. Gives operators both terminal and API observability.                                                                                                                             |
| 2   | **TUI framework: Ink (React for CLI)**                         | Declarative component model maps naturally to the spec's header/table/queue layout. Modest dependency cost at top layer.                                                                                                                                        |
| 3   | **Type placement: Split**                                      | Public contracts (`AgentBackend`, `IssueTrackerClient`, `Issue` model, `WorkflowDefinition`) in `packages/types/`. Internal state (RetryEntry, LiveSession, OrchestratorState) co-located in `packages/orchestrator/src/types/`. Matches graph/core convention. |
| 4   | **Template engine: LiquidJS**                                  | ADR specifies Liquid-compatible semantics. MIT license. Strict mode enforces unknown variable/filter failure. New dependency, justified by spec alignment.                                                                                                      |
| 5   | **Initial tracker: Roadmap only**                              | Local markdown file adapter. Zero credentials, fully testable. Proves `IssueTrackerClient` interface before adding network-dependent adapters.                                                                                                                  |
| 6   | **Initial backends: ClaudeBackend (subprocess) + MockBackend** | ClaudeBackend spawns `claude -p --output-format json` using existing machine auth, no API key env var required. MockBackend enables full orchestrator CI testing without LLM cost.                                                                              |
| 7   | **HTTP server: Node built-in `http`**                          | 4 endpoints don't justify a framework. Minimal dependency footprint. Easy to migrate later if API surface grows.                                                                                                                                                |
| 8   | **TUI-Core coupling: Snapshot-based**                          | Single `getSnapshot()` method serves TUI, HTTP API, and structured logs. Zero coupling between orchestrator and rendering consumers.                                                                                                                            |
| 9   | **Implementation approach: Core-Out with Concurrent Tracks**   | Pure-function state machine first, I/O adapters as parallel tracks, wiring phase, then observability layer. Hardest logic is most testable.                                                                                                                     |
| 10  | **Default WORKFLOW.md template: Harness skill pipeline**       | Default template guides dispatched agents through the harness skill pipeline (brainstorm, plan, execute, verify) per issue. Dogfoods the harness methodology.                                                                                                   |

---

## Technical Design

### Package Structure

```text
packages/orchestrator/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Barrel exports
│   ├── types/
│   │   ├── internal.ts             # RetryEntry, LiveSession, OrchestratorState
│   │   └── events.ts               # Internal event types for state transitions
│   ├── core/
│   │   ├── state-machine.ts        # Pure (state, event) → state functions
│   │   ├── candidate-selection.ts  # Sort, eligibility, blocker rules
│   │   ├── concurrency.ts          # Slot availability, per-state caps
│   │   ├── retry.ts                # Backoff calculation, continuation delays
│   │   └── reconciliation.ts       # Stall detection, state refresh logic
│   ├── workflow/
│   │   ├── loader.ts               # WORKFLOW.md discovery, YAML parse, prompt split
│   │   ├── config.ts               # Typed getters, defaults, $VAR resolution, ~ expansion
│   │   └── watcher.ts              # File watch, dynamic reload, last-known-good fallback
│   ├── tracker/
│   │   ├── client.ts               # Dispatcher that routes to adapter by kind
│   │   └── adapters/
│   │       └── roadmap.ts          # Markdown task list parser, hash-based IDs, hierarchy→blockers
│   ├── workspace/
│   │   ├── manager.ts              # Sanitization, create/reuse, root containment
│   │   └── hooks.ts                # Shell hook execution with timeouts
│   ├── agent/
│   │   ├── runner.ts               # Orchestrates session lifecycle, turn loop, prompt building
│   │   ├── backends/
│   │   │   ├── claude.ts           # Subprocess spawn, NDJSON parsing, session management
│   │   │   └── mock.ts             # Simulated agent for testing
│   │   └── events.ts               # Agent event normalization
│   ├── prompt/
│   │   └── renderer.ts             # LiquidJS strict rendering with issue + attempt vars
│   ├── orchestrator.ts             # Poll loop, dispatch, wiring of all components
│   ├── server/
│   │   ├── http.ts                 # Built-in http module, 4 endpoints, JSON error envelope
│   │   └── routes.ts               # Route handlers consuming getSnapshot()
│   ├── tui/
│   │   ├── app.tsx                 # Root Ink component
│   │   ├── header.tsx              # Global stats bar (agents, tokens, runtime, rate limits)
│   │   ├── agents-table.tsx        # Running agents table
│   │   └── backoff-queue.tsx       # Retry queue display
│   └── logging/
│       └── logger.ts               # Structured log emitter with context fields
├── tests/
│   ├── core/                       # Pure state machine tests (no I/O)
│   ├── workflow/                   # Loader, config, watcher tests
│   ├── tracker/                    # Roadmap adapter tests with fixtures
│   ├── workspace/                  # Filesystem tests (tmp dirs)
│   ├── agent/                      # Backend protocol tests
│   ├── prompt/                     # Template rendering tests
│   └── integration/                # End-to-end with MockBackend + roadmap fixture
└── fixtures/
    ├── workflows/                  # Sample WORKFLOW.md files
    └── roadmaps/                   # Sample roadmap.md files
```

### Shared Types (in `packages/types/`)

New exports added to `packages/types/src/index.ts`:

- `Issue` — Normalized issue record (id, identifier, title, description, priority, state, labels, blocked_by, timestamps)
- `BlockerRef` — `{id, identifier, state}` for blocker relations
- `IssueTrackerClient` — Interface: `fetchCandidateIssues()`, `fetchIssuesByStates()`, `fetchIssueStatesByIds()`
- `AgentBackend` — Interface: `startSession()`, `runTurn()`, `stopSession()`, `healthCheck()`
- `AgentSession`, `SessionStartParams`, `TurnParams`, `AgentEvent`, `TurnResult` — Backend protocol types
- `AgentError` — Typed error with category enum
- `WorkflowDefinition` — `{config, promptTemplate}` parsed from WORKFLOW.md
- `WorkflowConfig` — Typed config structure (tracker, polling, workspace, hooks, agent, server)
- `TokenUsage` — `{inputTokens, outputTokens, totalTokens}`

### Pure State Machine Core

The heart of the orchestrator is a set of pure functions with no I/O or side effects:

```typescript
// state-machine.ts
type OrchestratorEvent =
  | { type: 'tick'; candidates: Issue[]; runningStates: Map<string, Issue> }
  | { type: 'worker_exit'; issueId: string; reason: 'normal' | 'error'; error?: string }
  | { type: 'agent_update'; issueId: string; event: AgentEvent }
  | { type: 'retry_fired'; issueId: string }
  | { type: 'stall_detected'; issueId: string };

function applyEvent(
  state: OrchestratorState,
  event: OrchestratorEvent,
  config: WorkflowConfig
): {
  nextState: OrchestratorState;
  effects: SideEffect[];
};
```

Side effects are returned as data, not executed. The caller (`orchestrator.ts`) interprets and executes them. This makes every state transition testable with simple assertions against inputs and outputs.

`SideEffect` types include: `dispatch`, `stop`, `scheduleRetry`, `releaseClaim`, `cleanWorkspace`, `updateTokens`, `emitLog`.

### Snapshot-Based Observability

```typescript
// orchestrator.ts
interface RuntimeSnapshot {
  counts: { running: number; retrying: number };
  running: RunningEntry[]; // id, identifier, stage, pid, age, turn, tokens, session, lastEvent
  retrying: RetryingEntry[]; // id, identifier, attempt, dueIn, error
  tokenTotals: TokenTotals; // inputTokens, outputTokens, totalTokens, secondsRunning
  rateLimits: RateLimitSnapshot;
  config: { project: string; pollIntervalMs: number; maxConcurrent: number; backend: string };
  nextRefreshMs: number;
}

function getSnapshot(): RuntimeSnapshot;
```

Three consumers call `getSnapshot()` independently:

- **TUI**: Polls at ~250ms render interval via `useInterval` in Ink
- **HTTP API**: Called per request in route handlers
- **Structured logs**: Called at configurable intervals for periodic status emission

### Default WORKFLOW.md Template

The default template shipped with the orchestrator guides agents through harness skills:

```liquid
---
tracker:
  kind: roadmap
  file_path: docs/roadmap.md
polling:
  interval_ms: 30000
workspace:
  root: ~/.orchestrator/workspaces
agent:
  backend: claude
  max_concurrent_agents: 5
  max_turns: 20
---
You are working on the following issue in an isolated workspace.

## Issue
- **ID:** {{ issue.identifier }}
- **Title:** {{ issue.title }}
- **State:** {{ issue.state }}
{% if issue.description %}- **Description:** {{ issue.description }}{% endif %}
{% if issue.labels.size > 0 %}- **Labels:** {{ issue.labels | join: ", " }}{% endif %}

{% if attempt == null %}
## Instructions (First Run)

1. **Understand the task.** Read the issue description and any linked files carefully.
2. **Brainstorm.** Use `/harness:brainstorming` to explore the problem space, ask clarifying questions (check issue comments), and produce a spec in `docs/changes/`.
3. **Plan.** Use `/harness:planning` to create a detailed implementation plan from the spec.
4. **Execute.** Use `/harness:execution` to implement the plan with validation at each step.
5. **Review.** Use `/harness:code-review` to review your own changes for bugs, quality issues, and adherence to project conventions. Fix any findings before proceeding.
6. **Pre-commit check.** Use `/harness:pre-commit-review` to run the lightweight quality gate before committing. All checks must pass.
7. **Verify.** Use `/harness:verification` to confirm the implementation meets success criteria.
8. **Commit and push.** Create a feature branch, commit with conventional commit messages, and push.

Follow the harness methodology strictly. Do not skip phases.
{% else %}
## Instructions (Continuation — Attempt {{ attempt }})

You are resuming work on this issue. Check the current state of the workspace:
1. Review any existing specs in `docs/changes/` and plans in `docs/plans/`.
2. Check git status and recent commits to understand what was completed.
3. Continue from where the previous session left off.
4. If the previous attempt failed, diagnose the issue before retrying the same approach.
5. Before committing any new work, run `/harness:code-review` and `/harness:pre-commit-review`.
{% endif %}
```

### Dependency Graph

```text
packages/types  (no new deps)
     ↓
packages/orchestrator
  ├── @harness-engineering/types
  ├── liquidjs          (prompt rendering)
  ├── ink + react       (TUI)
  ├── yaml              (WORKFLOW.md front matter)
  ├── chokidar          (file watching)
  └── (node:http — built-in, no dep)
     ↓
packages/cli
  ├── @harness-engineering/orchestrator
  └── (existing deps)
```

---

## Success Criteria

### Core State Machine

1. Given a roadmap with 5 tasks (3 unchecked, 2 checked), the orchestrator dispatches exactly the 3 active tasks and ignores the 2 terminal ones.
2. Given `max_concurrent_agents: 2` and 5 eligible issues, only 2 workers run simultaneously; the remaining 3 dispatch as slots free up.
3. When a worker exits normally, a continuation retry fires after ~1s and re-checks the tracker.
4. When a worker exits abnormally, exponential backoff retries fire at 10s, 20s, 40s... capped at `max_retry_backoff_ms`.
5. When a roadmap task checkbox changes from `[ ]` to `[x]` during a run, reconciliation stops the worker and cleans the workspace.
6. When a parent task has unchecked children (blockers), it is not dispatched even if it is in an active state.
7. Pure state machine functions have 100% branch coverage with no I/O mocks.

### Workflow & Config

1. When `WORKFLOW.md` is modified on disk, the orchestrator applies new config to future dispatches without restart.
2. When a reload produces invalid YAML, the orchestrator keeps the last known good config and emits a structured error log.
3. `$VAR_NAME` tokens in config resolve from environment; missing required vars fail startup validation.
4. Prompt templates render with `issue` and `attempt` variables; unknown variables cause a render error that fails the run attempt.

### Workspace Management

1. Workspace paths are deterministic per issue identifier and stay within the configured root.
2. Path traversal attempts (e.g., `../../etc`) are sanitized to safe characters.
3. `after_create` hook failure aborts workspace creation. `before_run` failure aborts the run attempt. `after_run` failure is logged and ignored.
4. Hook execution respects `hooks.timeout_ms` and kills timed-out processes.

### Agent Backends

1. ClaudeBackend spawns `claude -p --output-format json`, streams NDJSON events, and captures session IDs for continuation turns.
2. MockBackend simulates full session lifecycle (start, events, result) with configurable delays and failure modes.
3. Both backends conform to the `AgentBackend` interface — swapping one for the other requires zero changes to orchestrator code.

### Observability

1. TUI displays global header (agents, tokens, runtime, next refresh), running agents table, and backoff queue, all from `getSnapshot()`.
2. HTTP `GET /api/v1/state` returns JSON matching the runtime snapshot schema.
3. HTTP `GET /api/v1/:id` returns issue-specific details or 404.
4. HTTP `POST /api/v1/refresh` triggers an immediate poll tick and returns 202.
5. Structured logs include `issue_id`, `issue_identifier`, `session_id`, `backend_name` context fields on all relevant entries.

### CLI & Lifecycle

1. `harness orchestrator run` starts the daemon with optional positional workflow path.
2. `SIGTERM` triggers graceful shutdown: stops dispatching, terminates agents within 30s grace period, preserves workspaces.
3. Startup with a missing or invalid `WORKFLOW.md` exits nonzero with a clear error.

### Integration

1. End-to-end test: MockBackend + roadmap fixture dispatches all active tasks, completes them, reconciles terminal state changes, and shuts down cleanly.

---

## Implementation Order

High-level phases — harness-planning will decompose these into granular tasks with dependencies and checkpoints.

### Phase 1: Foundation (types + pure core)

- Define shared types in `packages/types/` (Issue, AgentBackend, IssueTrackerClient, WorkflowDefinition, etc.)
- Define internal types in `packages/orchestrator/src/types/`
- Scaffold `packages/orchestrator/` with package.json, tsconfig.json, Turborepo registration
- Implement pure state machine core: state transitions, candidate selection, concurrency control, retry calculation, reconciliation logic
- Full unit tests for all state machine functions

### Phase 2: I/O Adapters (parallelizable tracks)

- **Track A:** Workflow Loader + Config Layer + File Watcher
- **Track B:** Roadmap Tracker Adapter (markdown parser, hash IDs, hierarchy to blockers)
- **Track C:** Workspace Manager + Hook execution with timeouts
- **Track D:** ClaudeBackend (subprocess spawn, NDJSON stream) + MockBackend
- **Track E:** Prompt Renderer (LiquidJS strict mode)

Each track is independently buildable and testable.

### Phase 3: Wiring

- `orchestrator.ts`: Poll loop, timer management, connects pure core to I/O adapters
- `runner.ts`: Agent session lifecycle, multi-turn loop
- `logging/logger.ts`: Structured log emitter with context fields
- Integration tests with MockBackend + roadmap fixture covering full dispatch/retry/reconciliation loop

### Phase 4: Observability & CLI

- Ink TUI: header, agents table, backoff queue consuming `getSnapshot()`
- HTTP server: 4 endpoints consuming `getSnapshot()`
- `linear_graphql` tool extension (interface wired, active when tracker.kind=linear)
- CLI command: `harness orchestrator run` in `packages/cli/`
- Default WORKFLOW.md template with harness skill pipeline
- End-to-end integration test suite
