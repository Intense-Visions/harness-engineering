# Scheduled Maintenance for Orchestrator

## Overview and Goals

The orchestrator gains a `MaintenanceScheduler` module that automatically keeps the codebase healthy by running mechanical checks and AI-powered cleanup tasks on configurable schedules. When issues are found, it creates or updates GitHub PRs with fixes. Multiple orchestrator instances coordinate via leader election so maintenance runs exactly once.

### Goals

1. Automatically detect and fix codebase health issues (architecture violations, dead code, doc drift, security findings, entropy) without human initiation
2. Minimize token cost by defaulting AI tasks to a local model backend
3. Keep PR noise low — one branch per maintenance category with additive commits and updated PR descriptions
4. Provide dashboard visibility into maintenance schedule, status, and history with manual trigger capability
5. Support multi-orchestrator deployments — only one instance runs maintenance at a time via ClaimManager leader election

### Non-goals

- Replacing manual code review — maintenance PRs still require human approval
- Adding new maintenance checks — this feature orchestrates existing commands and skills
- External scheduler integration (GitHub Actions, cron) — the orchestrator owns the schedule internally
- Auto-merging maintenance PRs

## Decisions

| Decision                        | Choice                                                              | Rationale                                                                            |
| ------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Module location                 | Separate module within orchestrator package (`src/maintenance/`)    | Clean separation without extraction refactor; reuses all orchestrator infrastructure |
| Multi-orchestrator coordination | Leader election via ClaimManager                                    | Low-contention (daily/weekly tasks); existing pattern; TTL-based failover            |
| Mechanical task execution       | Run check first, dispatch AI fix only if fixable issues found       | Minimizes unnecessary model invocations                                              |
| Pure AI task execution          | Always dispatch on schedule regardless of mechanical results        | Some health tasks (dead code, hotspots, deep security) have no mechanical precursor  |
| AI backend default              | `local` (Ollama/llama.cpp), configurable per-task                   | Token cost savings; user can override to cloud models for quality-sensitive tasks    |
| PR lifecycle                    | One branch per category, additive commits, PR body updated each run | Preserves review history; auto-rebase on conflict; fresh branch if rebase fails      |
| Dashboard integration           | Dedicated `/api/maintenance/*` endpoints + websocket events         | Maintenance is a distinct concern from issue dispatch; enables manual trigger        |
| Configuration                   | `maintenance` section in `WorkflowConfig`                           | Follows existing config patterns; single source of truth; typed                      |

## Technical Design

### Module Structure

```
packages/orchestrator/src/maintenance/
├── index.ts                 # Public API exports
├── scheduler.ts             # MaintenanceScheduler class — cron evaluation, leader coordination, task dispatch
├── task-registry.ts         # Built-in task definitions with defaults (schedule, type, branch, commands)
├── task-runner.ts           # Executes mechanical checks and dispatches AI agents
├── pr-manager.ts            # Branch lifecycle, PR creation/update, rebase/recreate on conflict
├── reporter.ts              # Collects run results, exposes data for dashboard
└── types.ts                 # MaintenanceConfig, TaskDefinition, RunResult, etc.
```

### Key Types

```typescript
// In @harness-engineering/types — extends WorkflowConfig
interface MaintenanceConfig {
  enabled: boolean;
  aiBackend?: AgentBackend; // default: 'local'
  baseBranch?: string; // default: 'main'
  branchPrefix?: string; // default: 'harness-maint/'
  leaderClaimTTLMs?: number; // default: 300_000 (5 min)
  checkIntervalMs?: number; // default: 60_000 (1 min) — how often to evaluate cron
  tasks?: Record<string, TaskOverride>;
}

interface TaskOverride {
  enabled?: boolean;
  schedule?: string; // cron expression override
  aiBackend?: AgentBackend; // per-task backend override
}

// In packages/orchestrator/src/maintenance/types.ts
type TaskType = 'mechanical-ai' | 'pure-ai' | 'report-only' | 'housekeeping';

interface TaskDefinition {
  id: string;
  type: TaskType;
  description: string;
  schedule: string; // default cron expression
  branch: string | null; // null for report-only/housekeeping
  checkCommand?: string[]; // for mechanical-ai: CLI args to run check
  fixSkill?: string; // skill to dispatch for AI fix
  reportOnly?: boolean;
}

interface RunResult {
  taskId: string;
  startedAt: string;
  completedAt: string;
  status: 'success' | 'failure' | 'skipped' | 'no-issues';
  findings: number;
  fixed: number;
  prUrl: string | null;
  prUpdated: boolean;
  error?: string;
}

interface MaintenanceStatus {
  isLeader: boolean;
  lastLeaderClaim: string | null;
  schedule: Array<{ taskId: string; nextRun: string; lastRun: RunResult | null }>;
  activeRun: { taskId: string; startedAt: string } | null;
  history: RunResult[];
}
```

### Task Registry

#### Mechanical to AI Fix (check first, AI agent only if fixable issues found)

| Task ID             | Check Command                       | Default Schedule                | Branch                             |
| ------------------- | ----------------------------------- | ------------------------------- | ---------------------------------- |
| `arch-violations`   | `check-arch`                        | `0 2 * * *` (daily 2am)         | `harness-maint/arch-fixes`         |
| `dep-violations`    | `check-deps`                        | `0 2 * * *` (daily 2am)         | `harness-maint/dep-fixes`          |
| `doc-drift`         | `check-docs`                        | `0 3 * * *` (daily 3am)         | `harness-maint/doc-fixes`          |
| `security-findings` | `check-security`                    | `0 1 * * *` (daily 1am)         | `harness-maint/security-fixes`     |
| `entropy`           | `cleanup` (detect mode)             | `0 3 * * *` (daily 3am)         | `harness-maint/entropy-fixes`      |
| `traceability`      | `traceability` / `check-phase-gate` | `0 6 * * 1` (weekly Monday 6am) | `harness-maint/traceability-fixes` |
| `cross-check`       | `validate-cross-check`              | `0 6 * * 1` (weekly Monday 6am) | `harness-maint/cross-check-fixes`  |

#### Pure AI (always dispatch on schedule)

| Task ID               | Skill                                            | Default Schedule                | Branch                        |
| --------------------- | ------------------------------------------------ | ------------------------------- | ----------------------------- |
| `dead-code`           | `cleanup-dead-code` / `harness-codebase-cleanup` | `0 2 * * 0` (weekly Sunday 2am) | `harness-maint/dead-code`     |
| `dependency-health`   | `harness-dependency-health`                      | `0 3 * * 0` (weekly Sunday 3am) | `harness-maint/dep-health`    |
| `hotspot-remediation` | `harness-hotspot-detector`                       | `0 4 * * 0` (weekly Sunday 4am) | `harness-maint/hotspot-fixes` |
| `security-review`     | `harness-security-review`                        | `0 1 * * 0` (weekly Sunday 1am) | `harness-maint/security-deep` |

#### Report-only (dashboard metrics, no PR)

| Task ID             | Command                        | Default Schedule                |
| ------------------- | ------------------------------ | ------------------------------- |
| `perf-check`        | `check-perf`                   | `0 6 * * 1` (weekly Monday 6am) |
| `decay-trends`      | `predict` / `get_decay_trends` | `0 7 * * 1` (weekly Monday 7am) |
| `project-health`    | `assess_project`               | `0 6 * * *` (daily 6am)         |
| `stale-constraints` | `detect_stale_constraints`     | `0 2 1 * *` (monthly 1st 2am)   |
| `graph-refresh`     | `graph scan`                   | `0 1 * * *` (daily 1am)         |

#### Housekeeping (mechanical, no AI)

| Task ID           | Command                 | Default Schedule             |
| ----------------- | ----------------------- | ---------------------------- |
| `session-cleanup` | `cleanup-sessions`      | `0 0 * * *` (daily midnight) |
| `perf-baselines`  | `perf baselines update` | `0 7 * * *` (daily 7am)      |

### Scheduler Lifecycle

```
Orchestrator.start()
  └── MaintenanceScheduler.start()
        ├── Loads task registry (built-in defaults merged with config overrides)
        ├── Starts check interval timer (every 60s):
        │     ├── Attempt ClaimManager.claim('maintenance-leader', ttl)
        │     ├── If not leader → skip, log debug
        │     ├── If leader → evaluate cron for each enabled task
        │     │     ├── If task is due → enqueue
        │     │     └── If not due → skip
        │     └── Process queue sequentially (one task at a time):
        │           ├── Emit websocket: maintenance:started
        │           ├── TaskRunner.run(task)
        │           ├── Emit websocket: maintenance:completed | maintenance:error
        │           └── Reporter.record(result)
        └── Registers /api/maintenance/* routes on OrchestratorServer
```

### Task Execution Flow

**Mechanical to AI:**

```
TaskRunner.runMechanicalAI(task)
  ├── Run check command in-process (e.g., runCheckArch())
  ├── Parse structured output for fixable issues
  ├── If no fixable issues → return { status: 'no-issues' }
  ├── If fixable issues found:
  │     ├── PRManager.ensureBranch(task.branch, baseBranch)
  │     ├── Dispatch AgentRunner with fixSkill to worktree on branch
  │     ├── Agent commits fixes
  │     ├── PRManager.ensurePR(task) — create or update
  │     └── return { status: 'success', prUrl, findings, fixed }
  └── On error → return { status: 'failure', error }
```

**Pure AI:**

```
TaskRunner.runPureAI(task)
  ├── PRManager.ensureBranch(task.branch, baseBranch)
  ├── Dispatch AgentRunner with fixSkill to worktree on branch
  │     └── Backend forced to config.aiBackend (default: 'local')
  ├── If agent produced commits:
  │     ├── PRManager.ensurePR(task) — create or update
  │     └── return { status: 'success', prUrl }
  └── If no commits → return { status: 'no-issues' }
```

**Report-only:**

```
TaskRunner.runReport(task)
  ├── Run check command in-process
  ├── Reporter.recordMetrics(taskId, output)
  └── return { status: 'success', findings }
```

### PR Manager Logic

```
PRManager.ensureBranch(branchName, baseBranch)
  ├── Check if remote branch exists (git ls-remote)
  ├── If exists → fetch and checkout
  │     ├── Attempt rebase onto baseBranch
  │     ├── If rebase fails → delete branch, recreate from baseBranch
  │     └── Note in PR body: "Branch recreated due to conflicts"
  └── If not exists → create from baseBranch

PRManager.ensurePR(task)
  ├── Check for open PR on branch (gh pr list --head <branch>)
  ├── If PR exists:
  │     ├── Push new commits
  │     ├── Update PR body with latest run summary (gh pr edit)
  │     └── return { prUpdated: true, prUrl }
  └── If no PR:
        ├── Push branch
        ├── Create PR (gh pr create) with:
        │     title: "[Maintenance] <task description>"
        │     body: run summary, findings count, task schedule
        │     labels: ['harness-maintenance', task.id]
        └── return { prUpdated: false, prUrl }
```

### Dashboard API

```
GET  /api/maintenance/schedule   → MaintenanceStatus.schedule
GET  /api/maintenance/status     → MaintenanceStatus (full)
GET  /api/maintenance/history    → RunResult[] (paginated, ?limit=20&offset=0)
POST /api/maintenance/trigger    → { taskId: string } — bypasses cron, respects leader
```

Websocket events on existing connection:

```
{ type: 'maintenance:started',   payload: { taskId, startedAt } }
{ type: 'maintenance:completed', payload: RunResult }
{ type: 'maintenance:error',     payload: { taskId, error } }
```

### File Layout Changes

| Action | File                                                     | Purpose                                        |
| ------ | -------------------------------------------------------- | ---------------------------------------------- |
| CREATE | `packages/orchestrator/src/maintenance/index.ts`         | Public exports                                 |
| CREATE | `packages/orchestrator/src/maintenance/scheduler.ts`     | Main scheduler class                           |
| CREATE | `packages/orchestrator/src/maintenance/task-registry.ts` | 17 built-in task definitions                   |
| CREATE | `packages/orchestrator/src/maintenance/task-runner.ts`   | Mechanical/AI/report execution                 |
| CREATE | `packages/orchestrator/src/maintenance/pr-manager.ts`    | Branch + PR lifecycle                          |
| CREATE | `packages/orchestrator/src/maintenance/reporter.ts`      | Run result collection + persistence            |
| CREATE | `packages/orchestrator/src/maintenance/types.ts`         | Type definitions                               |
| MODIFY | `packages/types/src/orchestrator.ts`                     | Add `MaintenanceConfig` to `WorkflowConfig`    |
| MODIFY | `packages/orchestrator/src/orchestrator.ts`              | Initialize `MaintenanceScheduler` in `start()` |
| MODIFY | `packages/orchestrator/src/server/http.ts`               | Register maintenance routes                    |
| CREATE | `packages/orchestrator/src/server/routes/maintenance.ts` | REST endpoint handlers                         |
| CREATE | `packages/orchestrator/tests/maintenance/`               | Test suite for all modules                     |

## Success Criteria

1. **Scheduler runs on schedule** — When `maintenance.enabled` is true, tasks execute at their configured cron times. Verified by: unit tests with mocked clock advancing past cron boundaries.

2. **Leader election prevents duplicate runs** — When multiple orchestrators are running, only one claims `maintenance-leader` and executes tasks. Verified by: integration test with two scheduler instances sharing a ClaimManager.

3. **Mechanical checks gate AI dispatch** — For `mechanical-ai` tasks, the AI agent is only dispatched when the check produces fixable findings. Verified by: test with zero-finding check output produces `status: 'no-issues'` and no agent invocation.

4. **Pure AI tasks always dispatch** — `pure-ai` tasks dispatch an agent on schedule regardless of any precondition. Verified by: test confirming agent dispatch with no prior check step.

5. **AI backend defaults to local** — When no override is configured, `AgentRunner` receives `backend: 'local'`. Verified by: asserting backend parameter in agent dispatch call.

6. **PR created on first run with findings** — When a task produces fixes and no PR exists, a new PR is created with the `harness-maintenance` label. Verified by: mocked `gh` calls asserting `pr create` invocation with correct args.

7. **PR updated on subsequent runs** — When a task produces fixes and a PR already exists on the branch, new commits are pushed and the PR body is updated. Verified by: mocked `gh` calls asserting `pr edit` invocation.

8. **Stale branch rebased or recreated** — When a maintenance branch conflicts with the base branch, rebase is attempted. If rebase fails, the branch is recreated from the base. Verified by: test with simulated merge conflict triggering branch recreation.

9. **Dashboard endpoints return correct data** — `GET /api/maintenance/schedule` returns next-run times, `GET /api/maintenance/status` returns current state, `GET /api/maintenance/history` returns past results. Verified by: HTTP tests against running server.

10. **Manual trigger works** — `POST /api/maintenance/trigger` with a valid `taskId` enqueues and executes the task outside the normal schedule. Verified by: HTTP test confirming task execution after POST.

11. **Report-only tasks produce no PR** — Tasks with `type: 'report-only'` record metrics to the reporter but never create branches or PRs. Verified by: asserting no `gh` or `git` calls for report-only task runs.

12. **Config overrides apply** — Per-task `enabled`, `schedule`, and `aiBackend` overrides in `WorkflowConfig.maintenance.tasks` take precedence over built-in defaults. Verified by: unit test with override config asserting changed behavior.

## Implementation Order

### Phase 1: Types and Task Registry

- Add `MaintenanceConfig` and `TaskOverride` to `@harness-engineering/types`
- Create `types.ts` with internal types (`TaskDefinition`, `RunResult`, `MaintenanceStatus`)
- Create `task-registry.ts` with all 17 built-in task definitions and default cron schedules
- Wire `maintenance?` into `WorkflowConfig`

### Phase 2: Scheduler Core

- Create `scheduler.ts` with `MaintenanceScheduler` class
- Implement cron evaluation loop (check interval timer, cron matching, task queueing)
- Integrate ClaimManager leader election (`maintenance-leader` claim with TTL)
- Wire into `Orchestrator.start()` / `Orchestrator.stop()`

### Phase 3: Task Runner

- Create `task-runner.ts` with execution paths for all four task types
- Mechanical-AI: invoke check command in-process, parse structured output, gate on fixable findings
- Pure-AI: dispatch AgentRunner with configured backend
- Report-only: run check, record metrics
- Housekeeping: run cleanup commands directly

### Phase 4: PR Manager

- Create `pr-manager.ts` with branch and PR lifecycle
- `ensureBranch()`: create, fetch, rebase, or recreate from base
- `ensurePR()`: detect existing PR, create or update, manage labels and body
- Integration with `gh` CLI for PR operations

### Phase 5: Reporter and Dashboard

- Create `reporter.ts` for run result collection and persistence (JSON file in `.harness/maintenance/`)
- Create `packages/orchestrator/src/server/routes/maintenance.ts` with REST endpoints
- Add websocket event emissions (`maintenance:started`, `maintenance:completed`, `maintenance:error`)
- Register routes in `OrchestratorServer`

### Phase 6: Tests

- Unit tests for cron evaluation, task registry merging, config overrides
- Unit tests for PR manager (branch lifecycle, PR create/update, rebase/recreate)
- Unit tests for task runner (each task type, backend selection, gating logic)
- Integration test for leader election (two schedulers, one ClaimManager)
- HTTP tests for all dashboard endpoints and manual trigger
