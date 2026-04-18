# Orchestrator HTTP API and Internals

This guide documents the Orchestrator's HTTP API, WebSocket interface, and internal subsystems: claim management, rate limiting, maintenance scheduling, task execution, and PR lifecycle management. For high-level concepts (daemon loop, state machine, workflows, workspaces), see the [Orchestrator Guide](./orchestrator.md).

## Server Overview

The Orchestrator hosts an HTTP server (default port `8080`, bound to `127.0.0.1`) that serves three purposes:

1. **API routes** for dashboard interactions, intelligence analysis, dispatch control, and maintenance operations.
2. **WebSocket endpoint** (`/ws`) for real-time state change and event streaming to connected dashboards.
3. **Static file serving** for the dashboard SPA (falls back to `index.html` for client-side routing).

### Authentication

When the `HARNESS_API_TOKEN` environment variable is set, all API routes require a bearer token:

```
Authorization: Bearer <HARNESS_API_TOKEN>
```

Read-only endpoints (`GET /api/state`, static files) are exempt. When `HARNESS_API_TOKEN` is not set, all routes are open (localhost-only by default).

Unauthorized requests receive:

```json
{ "error": "Unauthorized -- set Authorization: Bearer <HARNESS_API_TOKEN>" }
```

---

## HTTP API Reference

### State

#### `GET /api/state`

Returns a full snapshot of the orchestrator's current state. Also available at the legacy path `GET /api/v1/state`.

**Response** `200 OK`

```json
{
  "running": { "<issueId>": { "...": "..." } },
  "retryQueue": [],
  "candidates": [],
  "config": { "...": "..." }
}
```

---

### Interactions

Interactions are questions or approval requests that agents raise during execution. The dashboard uses these endpoints to display and resolve them.

#### `GET /api/interactions`

List all pending interactions.

**Response** `200 OK` — Array of interaction objects sorted by creation time.

#### `PATCH /api/interactions/:id`

Update the status of a specific interaction.

**Request body:**

```json
{ "status": "pending" | "claimed" | "resolved" }
```

**Responses:**

| Status | Condition                                      |
| ------ | ---------------------------------------------- |
| `200`  | Status updated successfully (`{ "ok": true }`) |
| `400`  | Invalid interaction ID or invalid status value |
| `404`  | Interaction not found                          |

---

### Plans

Plans are markdown documents that describe implementation strategies for issues. The plan watcher monitors the plans directory and creates interactions when new plans appear.

#### `POST /api/plans`

Write a plan file to the plans directory.

**Request body:**

```json
{
  "filename": "my-plan.md",
  "content": "# Plan\n\nPlan content here..."
}
```

**Constraints:**

- `filename` must be a simple `.md` filename with no path separators (no directory traversal).
- Non-`.md` filenames are rejected.

**Responses:**

| Status | Condition                                                 |
| ------ | --------------------------------------------------------- |
| `201`  | Plan written (`{ "ok": true, "filename": "my-plan.md" }`) |
| `400`  | Invalid filename or missing content                       |

---

### Chat Proxy

Proxies requests to the Claude Code CLI, streaming responses back as Server-Sent Events (SSE). Supports multi-turn conversations via Claude Code's native session management.

#### `POST /api/chat`

Start or continue a chat conversation.

**Request body:**

```json
{
  "prompt": "What does the auth module do?",
  "system": "You are a helpful assistant.",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field       | Required | Description                                                                          |
| ----------- | -------- | ------------------------------------------------------------------------------------ |
| `prompt`    | Yes      | The user message to send                                                             |
| `system`    | No       | System prompt (prepended on first turn only)                                         |
| `sessionId` | No       | UUID from a previous response to continue that conversation. Omit for a new session. |

**Response** — SSE stream (`text/event-stream`).

Each event is a JSON object on a `data:` line. Event types:

| Type          | Payload                 | Description                                               |
| ------------- | ----------------------- | --------------------------------------------------------- |
| `session`     | `{ sessionId }`         | Emitted first. Save this ID to continue the conversation. |
| `text`        | `{ text }`              | Text content from the assistant                           |
| `thinking`    | `{ text }`              | Extended thinking content                                 |
| `tool_use`    | `{ tool, args? }`       | Tool invocation (args truncated to 500 chars)             |
| `tool_result` | `{ content, isError? }` | Tool result (content truncated to 1000 chars)             |
| `status`      | `{ text }`              | Progress status updates                                   |
| `error`       | `{ error }`             | Error message                                             |

The stream ends with `data: [DONE]`.

**How sessions work:** On the first turn (no `sessionId`), the CLI is spawned with `--session-id <uuid>`. On subsequent turns, the CLI is spawned with `--resume <sessionId>`, so Claude Code maintains full conversation context natively.

---

### Analyze (Intelligence Pipeline)

Runs a work item description through the intelligence pipeline (SEL, CML, PESL) and streams results as SSE.

#### `POST /api/analyze`

**Request body:**

```json
{
  "title": "Add user notification preferences",
  "description": "Allow users to configure email and Slack notification settings",
  "labels": ["feature", "notifications"]
}
```

| Field         | Required | Description            |
| ------------- | -------- | ---------------------- |
| `title`       | Yes      | Work item title        |
| `description` | No       | Detailed description   |
| `labels`      | No       | Array of label strings |

**Response** — SSE stream (`text/event-stream`).

Events are emitted as pipeline stages complete:

| Type          | Payload     | Description                                                                                            |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `status`      | `{ text }`  | Progress updates (e.g., "Running spec enrichment (SEL)...")                                            |
| `sel_result`  | `{ data }`  | Spec enrichment result: intent, summary, affected systems, unknowns, ambiguities, risk signals         |
| `cml_result`  | `{ data }`  | Complexity score: overall, riskLevel, confidence, blastRadius, dimensions, reasoning, recommendedRoute |
| `pesl_result` | `{ data }`  | Simulation result (only emitted when `recommendedRoute` is `simulation-required`)                      |
| `signals`     | `{ data }`  | Concern signals derived from the complexity score                                                      |
| `error`       | `{ error }` | Error message                                                                                          |

**Responses:**

| Status | Condition                         |
| ------ | --------------------------------- |
| `200`  | SSE stream begins                 |
| `400`  | Invalid request body              |
| `503`  | Intelligence pipeline not enabled |

---

### Analyses Archive

Persisted intelligence analysis results, accessible after pipeline runs complete.

#### `GET /api/analyses`

List all archived analysis records.

**Response** `200 OK` — Array of analysis record objects.

#### `GET /api/analyses/:issueId`

Get a single analysis record by issue ID.

**Responses:**

| Status | Condition                                |
| ------ | ---------------------------------------- |
| `200`  | Analysis record found                    |
| `400`  | Invalid issueId (path traversal attempt) |
| `404`  | No analysis found for this issue         |

---

### Roadmap Actions

#### `POST /api/roadmap/append`

Add a work item to the roadmap's Backlog milestone.

**Request body:**

```json
{
  "title": "Add webhook support",
  "summary": "Support outbound webhook notifications",
  "labels": ["feature"],
  "enrichedSpec": {
    "intent": "Add webhook delivery for notification events",
    "unknowns": [],
    "ambiguities": ["retry policy unclear"],
    "riskSignals": [],
    "affectedSystems": [{ "name": "notification-service" }]
  },
  "cmlRecommendedRoute": "local"
}
```

| Field                 | Required | Description                                              |
| --------------------- | -------- | -------------------------------------------------------- |
| `title`               | Yes      | Feature title (no newlines or markdown headings)         |
| `summary`             | No       | Brief summary (defaults to title or enrichedSpec.intent) |
| `labels`              | No       | Array of label strings                                   |
| `enrichedSpec`        | No       | SEL output from a prior `/api/analyze` call              |
| `cmlRecommendedRoute` | No       | One of `local`, `human`, `simulation-required`           |

**Responses:**

| Status | Condition                                                 |
| ------ | --------------------------------------------------------- |
| `201`  | Feature appended (`{ "ok": true, "featureName": "..." }`) |
| `400`  | Invalid title or body                                     |
| `503`  | Roadmap path not configured                               |

The write is atomic (write to temp file, then rename).

---

### Dispatch Actions

#### `POST /api/dispatch/adhoc`

Immediately dispatch a work item to an agent, bypassing the normal roadmap-to-tick-to-dispatch cycle.

**Request body:**

```json
{
  "title": "Fix broken login redirect",
  "description": "The login page redirects to /undefined after OAuth callback",
  "labels": ["bug", "auth"]
}
```

| Field         | Required | Description            |
| ------------- | -------- | ---------------------- |
| `title`       | Yes      | Work item title        |
| `description` | No       | Detailed description   |
| `labels`      | No       | Array of label strings |

A synthetic `Issue` object is created with a deterministic ID derived from the title hash.

**Responses:**

| Status | Condition                                                                  |
| ------ | -------------------------------------------------------------------------- |
| `200`  | Dispatch initiated (`{ "ok": true, "issueId": "fix-broken-lo-a1b2c3d4" }`) |
| `400`  | Invalid request body                                                       |
| `503`  | Dispatch not available (orchestrator not configured for ad-hoc dispatch)   |

---

### Maintenance

Dashboard routes for the maintenance scheduler. All routes under `/api/maintenance/` return `503` if maintenance dependencies are not yet initialized.

#### `GET /api/maintenance/schedule`

Returns the schedule entries for all enabled tasks, including next-run times and last run results.

**Response** `200 OK` — Array of `ScheduleEntry` objects:

```json
[
  {
    "taskId": "arch-violations",
    "nextRun": "2026-04-19T02:00:00.000Z",
    "lastRun": {
      "taskId": "arch-violations",
      "startedAt": "2026-04-18T02:00:01.000Z",
      "completedAt": "2026-04-18T02:03:45.000Z",
      "status": "success",
      "findings": 3,
      "fixed": 3,
      "prUrl": "https://github.com/org/repo/pull/42",
      "prUpdated": true
    }
  }
]
```

#### `GET /api/maintenance/status`

Returns full maintenance status including leadership state, schedule, active run, and history.

**Response** `200 OK` — `MaintenanceStatus` object:

```json
{
  "isLeader": true,
  "lastLeaderClaim": "2026-04-18T12:00:00.000Z",
  "schedule": ["..."],
  "activeRun": { "taskId": "doc-drift", "startedAt": "2026-04-18T03:00:01.000Z" },
  "history": ["..."]
}
```

#### `GET /api/maintenance/history`

Returns paginated run history.

**Query parameters:**

| Parameter | Default | Max | Description                 |
| --------- | ------- | --- | --------------------------- |
| `limit`   | 20      | 100 | Number of records to return |
| `offset`  | 0       | --  | Number of records to skip   |

**Response** `200 OK` — Array of `RunResult` objects (most recent first).

#### `POST /api/maintenance/trigger`

Manually trigger a maintenance task for immediate execution.

**Request body:**

```json
{ "taskId": "arch-violations" }
```

**Responses:**

| Status | Condition                                                      |
| ------ | -------------------------------------------------------------- |
| `200`  | Task triggered (`{ "ok": true, "taskId": "arch-violations" }`) |
| `400`  | Missing or invalid taskId                                      |
| `503`  | Maintenance not available                                      |

---

### Sessions

Chat session metadata management for the dashboard.

#### `GET /api/sessions`

List all saved chat sessions, sorted by most recently active.

**Response** `200 OK` — Array of session metadata objects.

#### `POST /api/sessions`

Create or save a chat session.

**Request body:**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Auth module exploration",
  "lastActiveAt": "2026-04-18T12:00:00.000Z"
}
```

The `sessionId` field is required and must be a valid UUID or safe filename. Additional fields are stored as-is.

**Response** `200 OK` — `{ "ok": true }`

#### `PATCH /api/sessions/:id`

Update fields on an existing session.

**Request body:** — Any JSON object with fields to merge into the session.

**Response** `200 OK` — `{ "ok": true }`

#### `DELETE /api/sessions/:id`

Delete a session and its metadata directory.

**Response** `200 OK` — `{ "ok": true }`

---

## WebSocket Interface

Connect to `ws://localhost:8080/ws` for real-time event streaming. Only the `/ws` path is accepted; connections to other paths are destroyed.

On connection, the server immediately sends a `state_change` message with the current orchestrator snapshot so dashboards do not need to poll.

### Message Format

All messages are JSON with a `type` and `data` field:

```json
{ "type": "state_change", "data": { "...": "..." } }
```

### Event Types

| Type                    | Description                                                          |
| ----------------------- | -------------------------------------------------------------------- |
| `state_change`          | Full orchestrator state snapshot (emitted on every state transition) |
| `agent_event`           | Agent lifecycle events (dispatch, progress, completion)              |
| `interaction_new`       | New interaction pushed to the queue                                  |
| `maintenance:started`   | Maintenance task execution began                                     |
| `maintenance:completed` | Maintenance task execution finished                                  |
| `maintenance:error`     | Maintenance task execution failed                                    |

---

## Claim Manager

The `ClaimManager` coordinates work claiming across multiple orchestrator instances. It uses the issue tracker as a shared state layer with an optimistic concurrency model.

### How Claiming Works

1. **Write claim.** The orchestrator calls `claimIssue(issueId, orchestratorId)` on the tracker, writing its ID as the assignee.
2. **Verification delay.** After writing, the claim manager waits for a configurable delay (default: 2000ms) to allow other orchestrators to potentially overwrite the claim.
3. **Read-back verification.** The claim manager reads the issue back from the tracker. If the assignee still matches this orchestrator, the claim is confirmed. If another orchestrator's ID appears, the claim is rejected.

This optimistic-locking pattern means two orchestrators racing on the same issue will both write, but only one will see its own ID on read-back.

### Configuration

| Option          | Default         | Description                                            |
| --------------- | --------------- | ------------------------------------------------------ |
| `verifyDelayMs` | `2000`          | Milliseconds between claim write and verification read |
| `claimedState`  | `'in-progress'` | State name used for claimed issues                     |

### Heartbeat

The claim manager provides a `heartbeat(issueIds)` method that refreshes claim timestamps for all running issues in parallel. Individual heartbeat failures are swallowed so one failing claim does not block others.

### Staleness Detection

The `isStale(issue, ttlMs)` method checks whether an issue's claim has expired based on its `updatedAt` timestamp. Issues with a missing `updatedAt` are always considered stale. This detects orchestrator crashes where heartbeats stopped.

### Startup Reconciliation

On startup, `reconcileOnStartup(runningIssueIds)` scans the tracker for in-progress issues assigned to this orchestrator and releases any that are not in the current running map. This cleans up orphaned claims from a previous crash or unclean shutdown.

---

## Rate Limiter

The rate limiter computes the delay needed before the next API request, based on a snapshot of recent activity and configured limits. It returns `0` when no throttling is needed.

### Throttle Hierarchy

The rate limiter evaluates limits in this order and returns the delay from the first limit that is exceeded:

1. **Global cooldown** -- If an explicit rate-limit event set a cooldown timestamp and it has not expired, the remaining cooldown is returned.
2. **Per-minute request limit** -- If more than `maxRequestsPerMinute` requests occurred in the last 60 seconds, the delay is computed from the oldest request in the window.
3. **Per-second request limit** -- Same logic for `maxRequestsPerSecond` over a 1-second window.
4. **Input token limit** -- If `maxInputTokensPerMinute` is set and the token sum in the last 60 seconds exceeds it, a delay is returned.
5. **Output token limit** -- Same logic for `maxOutputTokensPerMinute`.

### Configuration

```typescript
interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerSecond: number;
  maxInputTokensPerMinute: number;
  maxOutputTokensPerMinute: number;
}
```

Setting a token limit to `0` disables that check.

---

## Maintenance Scheduler

The maintenance scheduler evaluates cron schedules on an interval timer, performs leader election via the claim manager, and invokes task execution for due tasks.

### Evaluation Loop

The scheduler runs on a configurable interval (default: 60 seconds). Each evaluation:

1. **Attempts leader claim** via the claim manager using the virtual issue ID `maintenance-leader`. If another orchestrator wins leadership, this instance skips the evaluation.
2. **Builds a queue** of tasks whose cron schedule matches the current time. Tasks that already ran in the current minute are skipped (dedup by epoch-minute).
3. **Processes the queue** sequentially, invoking the `onTaskDue` callback for each task.

### Built-in Tasks

The orchestrator ships with 18 built-in maintenance tasks across four types:

#### Mechanical-AI Tasks (7)

Run a check command first; dispatch an AI agent only if fixable issues are found.

| Task ID             | Default Schedule | Check Command          | Fix Skill                  |
| ------------------- | ---------------- | ---------------------- | -------------------------- |
| `arch-violations`   | Daily 2:00 AM    | `check-arch`           | `harness-arch-fix`         |
| `dep-violations`    | Daily 2:00 AM    | `check-deps`           | `harness-dep-fix`          |
| `doc-drift`         | Daily 3:00 AM    | `check-docs`           | `harness-doc-fix`          |
| `security-findings` | Daily 1:00 AM    | `check-security`       | `harness-security-fix`     |
| `entropy`           | Daily 3:00 AM    | `cleanup`              | `harness-entropy-fix`      |
| `traceability`      | Weekly Mon 6 AM  | `traceability`         | `harness-traceability-fix` |
| `cross-check`       | Weekly Mon 6 AM  | `validate-cross-check` | `harness-cross-check-fix`  |

#### Pure-AI Tasks (4)

Always dispatch an AI agent on schedule, regardless of preconditions.

| Task ID               | Default Schedule | Fix Skill                   |
| --------------------- | ---------------- | --------------------------- |
| `dead-code`           | Weekly Sun 2 AM  | `harness-codebase-cleanup`  |
| `dependency-health`   | Weekly Sun 3 AM  | `harness-dependency-health` |
| `hotspot-remediation` | Weekly Sun 4 AM  | `harness-hotspot-detector`  |
| `security-review`     | Weekly Sun 1 AM  | `harness-security-review`   |

#### Report-Only Tasks (5)

Run a command and record metrics. No branches, no PRs.

| Task ID             | Default Schedule | Check Command              |
| ------------------- | ---------------- | -------------------------- |
| `perf-check`        | Weekly Mon 6 AM  | `check-perf`               |
| `decay-trends`      | Weekly Mon 7 AM  | `predict`                  |
| `project-health`    | Daily 6:00 AM    | `assess_project`           |
| `stale-constraints` | Monthly 1st 2 AM | `detect_stale_constraints` |
| `graph-refresh`     | Daily 1:00 AM    | `graph scan`               |

#### Housekeeping Tasks (2)

Run a command directly. No AI, no PRs.

| Task ID           | Default Schedule | Command                 |
| ----------------- | ---------------- | ----------------------- |
| `session-cleanup` | Daily midnight   | `cleanup-sessions`      |
| `perf-baselines`  | Daily 7:00 AM    | `perf baselines update` |

### Configuration Overrides

Tasks can be customized in the maintenance config section of `WORKFLOW.md`:

```yaml
maintenance:
  checkIntervalMs: 60000
  aiBackend: local
  tasks:
    arch-violations:
      enabled: false # Disable this task entirely
    doc-drift:
      schedule: '0 4 * * *' # Override to 4 AM instead of 3 AM
      aiBackend: claude # Use a specific backend for this task
```

Per-task overrides:

- `enabled: false` removes the task from the schedule.
- `schedule` replaces the default cron expression.
- `aiBackend` overrides the global AI backend for that task.

---

## Task Runner

The `TaskRunner` executes a single maintenance task based on its type. It never throws; errors are captured in the `RunResult`.

### Execution Paths

#### `mechanical-ai`

1. Run the check command (e.g., `harness check-arch`).
2. If findings is 0, return `status: 'no-issues'`.
3. If a PR manager is available, create or checkout the maintenance branch.
4. Dispatch the AI agent with the configured `fixSkill`.
5. If the agent produced commits and a PR manager is available, create or update the PR.

#### `pure-ai`

1. Create or checkout the maintenance branch.
2. Dispatch the AI agent unconditionally.
3. If the agent produced commits, create or update the PR.
4. If no commits were produced, return `status: 'no-issues'`.

#### `report-only`

1. Run the check command.
2. Record the findings count.
3. No AI dispatch, no branch, no PR.

#### `housekeeping`

1. Run the command directly via the command executor.
2. No AI, no branch, no PR.

### Backend Resolution

The AI backend for a task is resolved with this priority:

1. Per-task `aiBackend` override in config.
2. Global `maintenance.aiBackend` in config.
3. Default: `'local'`.

### Run Result

Every execution returns a `RunResult`:

```typescript
{
  taskId: string;
  startedAt: string;       // ISO timestamp
  completedAt: string;     // ISO timestamp
  status: 'success' | 'failure' | 'skipped' | 'no-issues';
  findings: number;
  fixed: number;
  prUrl: string | null;
  prUpdated: boolean;
  error?: string;          // Present when status is 'failure'
}
```

---

## PR Manager

The `PRManager` handles branch lifecycle and PR lifecycle for maintenance tasks using `git` and `gh` CLI commands.

### Branch Management (`ensureBranch`)

Given a branch name and base branch:

1. **Branch does not exist remotely:** Fetch the base branch and create a new branch from it.
2. **Branch exists remotely:** Fetch it, checkout, hard-reset to remote, and attempt rebase onto the base branch.
3. **Rebase fails:** Abort the rebase, delete the branch (local and remote), and recreate from the base branch. This ensures a clean slate when conflicts arise.

### PR Management (`ensurePR`)

After the task runner pushes commits:

1. **Push** the branch to origin with `--force-with-lease`.
2. **Check for existing PR** using `gh pr list --head <branch>`.
3. **If PR exists:** Update its body with the latest run summary via `gh pr edit`.
4. **If no PR exists:** Create a new PR with:
   - Title: `[Maintenance] <task description>`
   - Labels: `harness-maintenance`, `<task-id>`
   - Body: Task metadata and run summary

PR creation failures are non-fatal when the agent has already committed work to the branch. The commits are preserved for the next run.

### PR Detection for Dispatch

The `PRDetector` prevents the orchestrator from dispatching agents to issues that already have open pull requests. It checks:

1. **By external ID** -- For issues with a `github:owner/repo#N` external ID, searches for PRs linked via `closes #N`.
2. **By branch convention** -- For other issues, searches for PRs with a `feat/<identifier>` head branch.

All checks are fail-open: if the `gh` CLI is unavailable, authentication is missing, or the network is down, candidates pass through rather than being incorrectly blocked. Concurrent `gh` calls are throttled to 3 at a time to avoid GitHub API rate limits.

---

_Last Updated: 2026-04-18_
