# Orchestrator API Reference

The `@harness-engineering/orchestrator` package provides the core implementation of the Harness Orchestrator daemon.

**Source:** [orchestrator.ts](../../packages/orchestrator/src/orchestrator.ts), [runner.ts](../../packages/orchestrator/src/agent/runner.ts)

## Classes

### `Orchestrator`

The main daemon class that manages the polling loop and agent lifecycle.

- `constructor(config: WorkflowConfig, promptTemplate: string)`
- `start()`: Starts the polling interval and the internal HTTP server.
- `stop()`: Performs a graceful shutdown of all active agents and the server.
- `tick()`: Manually triggers a poll and reconciliation cycle.
- `getSnapshot()`: Returns a point-in-time snapshot of the internal state for observability.

### `AgentRunner`

Manages a multi-turn session for a single agent.

- `runSession(issue: Issue, workspacePath: string, prompt: string)`: An async generator that yields agent events and returns the final `TurnResult`.

### `WorkspaceManager`

Handles the creation and sanitization of per-issue workspaces.

- `ensureWorkspace(identifier: string)`: Ensures a deterministic directory exists for the issue.
- `removeWorkspace(identifier: string)`: Cleans up a workspace directory.

## Interfaces

### `WorkflowConfig`

The configuration schema extracted from `WORKFLOW.md`.

```typescript
interface WorkflowConfig {
  tracker: TrackerConfig;
  polling: PollingConfig;
  workspace: WorkspaceConfig;
  hooks: HooksConfig;
  agent: AgentConfig;
  server: ServerConfig;
}
```

### `SideEffect`

A data structure representing an action to be performed by the daemon.

```typescript
type SideEffect =
  | { type: 'dispatch'; issue: Issue; attempt: number | null }
  | { type: 'stop'; issueId: string; reason: string }
  | { type: 'scheduleRetry'; issueId: string; delayMs: number }
  | { type: 'cleanWorkspace'; identifier: string };
```

## Event Types

### `OrchestratorEvent`

Internal events that drive the core state machine.

- `tick`: Triggered by the polling interval.
- `worker_exit`: Triggered when an agent process completes.
- `agent_update`: Triggered when an agent sends a status message.
- `retry_fired`: Triggered when a backoff timer expires.

## Tracker Adapters

Tracker adapters implement `IssueTrackerClient` to bridge external issue sources into the orchestrator's internal `Issue` model.

### `RoadmapTrackerAdapter`

**Source:** [roadmap.ts](../../packages/orchestrator/src/tracker/adapters/roadmap.ts)

Uses `docs/roadmap.md` as an issue tracker. Parses the roadmap via `parseRoadmap` from `@harness-engineering/core`, extracts features, and maps them to `Issue` objects using deterministic hashing for identifiers. Feature statuses (`backlog`, `planned`, `in-progress`, `done`, `blocked`) map directly to issue states.
