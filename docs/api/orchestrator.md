# Orchestrator API Reference

The `@harness-engineering/orchestrator` package (v0.4.1) provides the core implementation of the Harness Orchestrator daemon.

**Source:** [orchestrator.ts](../../packages/orchestrator/src/orchestrator.ts), [runner.ts](../../packages/orchestrator/src/agent/runner.ts), [types/events.ts](../../packages/orchestrator/src/types/events.ts)

## Classes

### `Orchestrator`

The main daemon class that manages the polling loop and agent lifecycle.

- `constructor(config: WorkflowConfig, promptTemplate: string, overrides?: { tracker?: IssueTrackerClient; backend?: AgentBackend; execFileFn?: ExecFileFn })`: The optional `overrides` parameter allows dependency injection for testing or custom behavior.
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

The configuration schema extracted from `harness.orchestrator.md`.

```typescript
interface WorkflowConfig {
  tracker: TrackerConfig;
  polling: PollingConfig;
  workspace: WorkspaceConfig;
  hooks: HooksConfig;
  agent: AgentConfig;
  server: ServerConfig;
  intelligence?: IntelligenceConfig;
  maintenance?: MaintenanceConfig;
  orchestratorId?: string;
}
```

### `SideEffect`

A data structure representing an action to be performed by the daemon.

```typescript
type SideEffect =
  | DispatchEffect // { type: 'dispatch'; issue; attempt; backend? }
  | StopEffect // { type: 'stop'; issueId; reason }
  | ScheduleRetryEffect // { type: 'scheduleRetry'; issueId; identifier; attempt; delayMs; error }
  | ReleaseClaimEffect // { type: 'releaseClaim'; issueId }
  | CleanWorkspaceEffect // { type: 'cleanWorkspace'; issueId; identifier }
  | UpdateTokensEffect // { type: 'updateTokens'; issueId; usage: TokenUsage }
  | EmitLogEffect // { type: 'emitLog'; level; message; context? }
  | EscalateEffect // { type: 'escalate'; issueId; identifier; reasons; enrichedSpec?; ... }
  | ClaimEffect; // { type: 'claim'; issue; backend?; attempt }
```

## Event Types

### `OrchestratorEvent`

Internal events that drive the core state machine.

- `tick`: Triggered by the polling interval. Carries `candidates`, `runningStates`, and optional intelligence pipeline data (`concernSignals`, `enrichedSpecs`, `complexityScores`, `simulationResults`).
- `worker_exit`: Triggered when an agent process completes. Carries `issueId`, `reason` ('normal' | 'error'), and optional `error`.
- `agent_update`: Triggered when an agent sends a status message. Carries `issueId` and the `AgentEvent`.
- `retry_fired`: Triggered when a backoff timer expires. Carries `issueId` and `candidates`.
- `stall_detected`: Triggered when an agent is detected as inactive. Carries `issueId`.
- `claim_rejected`: Triggered when another orchestrator wins a race claim. Carries `issueId`.

## Tracker Adapters

Tracker adapters implement `IssueTrackerClient` to bridge external issue sources into the orchestrator's internal `Issue` model.

### `RoadmapTrackerAdapter`

**Source:** [roadmap.ts](../../packages/orchestrator/src/tracker/adapters/roadmap.ts)

Uses `docs/roadmap.md` as an issue tracker. Parses the roadmap via `parseRoadmap` from `@harness-engineering/core`, extracts features, and maps them to `Issue` objects using deterministic hashing for identifiers. Feature statuses (`backlog`, `planned`, `in-progress`, `done`, `blocked`, `needs-human`) map directly to issue states.

### `IssueTrackerClient` Interface

All tracker adapters implement this interface:

| Method                           | Description                                    |
| -------------------------------- | ---------------------------------------------- |
| `fetchCandidateIssues()`         | Fetches issues eligible for dispatch           |
| `fetchIssuesByStates(states)`    | Fetches issues in specific states              |
| `fetchIssueStatesByIds(ids)`     | Fetches current states for specific issue IDs  |
| `markIssueComplete(id, result)`  | Marks an issue as complete with results        |
| `claimIssue(id, orchestratorId)` | Claims an issue for this orchestrator instance |
| `releaseIssue(id)`               | Releases a previously claimed issue            |

## Claim Management

The orchestrator supports multi-instance coordination via claim management. When multiple orchestrator instances watch the same tracker, `ClaimManager` ensures only one instance works on each issue at a time using atomic claim/release/heartbeat operations.

## Intelligence Pipeline

When `intelligence` config is provided, the orchestrator runs an intelligence pipeline before dispatch:

- **SEL (Spec Enrichment Layer):** Enriches specs with domain context
- **CML (Complexity Modeling Layer):** Scores issue complexity
- **PESL (Pre-Execution Simulation Layer):** Simulates execution outcomes

**Types:** `EnrichedSpec`, `ComplexityScore`, `SimulationResult` (from `@harness-engineering/intelligence`)

## Model Routing & Escalation

The orchestrator routes issues to different model tiers based on complexity signals and concern analysis.

**Types:** `ScopeTier`, `ConcernSignal`, `RoutingDecision`, `EscalationConfig`

## Agent Backends

Multiple backend implementations are available:

| Backend            | Description                                     |
| ------------------ | ----------------------------------------------- |
| `ClaudeBackend`    | Anthropic Claude via Claude Code CLI            |
| `OpenAIBackend`    | OpenAI models                                   |
| `GeminiBackend`    | Google Gemini models                            |
| `AnthropicBackend` | Direct Anthropic API                            |
| `LocalBackend`     | Local model execution (for triage/simple tasks) |
| `PiBackend`        | Pi model backend                                |

## Container Sandboxing

When configured, agents run in isolated containers with secret injection for secure execution.

**Types:** `ContainerHandle`, `ContainerRuntime`, `ContainerConfig`, `SecretBackend`, `SecretConfig` (from `@harness-engineering/types`)

## Maintenance Subsystem

Scheduled maintenance tasks (e.g., workspace cleanup, stale session pruning) run on configurable intervals.

**Types:** `MaintenanceConfig`, `TaskOverride` (from `@harness-engineering/types`)

## Additional Subsystems

| Subsystem         | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| `PRDetector`      | Filters candidate issues that already have open PRs          |
| `StreamRecorder`  | Records agent sessions as JSONL streams for dashboard replay |
| `AnalysisArchive` | Archives and auto-publishes intelligence analyses to GitHub  |
