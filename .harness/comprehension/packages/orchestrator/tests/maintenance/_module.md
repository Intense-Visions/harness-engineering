---
schemaVersion: 1
module: "packages/orchestrator/tests/maintenance"
sourceHash: "e44a2ffa890dd2844a0dc24308e50c94be534b7f47d9e05ab566a04d4ceab5a2"
compiledAt: "2026-08-28T01:22:12.734Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["barrel-exports.test.ts", "check-runner.test.ts", "check-script-runner.behavior.test.ts", "check-script-runner.test.ts", "context-resolver.test.ts", "cron-matcher.test.ts", "custom-task-validator.test.ts", "integration-full-cycle.test.ts", "integration-leader-election.test.ts", "main-sync-trigger.test.ts", "maintenance-routes.test.ts", "normalize-harness-command.test.ts", "output-store.test.ts", "overdue.test.ts", "pr-manager.test.ts", "reporter.test.ts", "scheduler.test.ts", "sync-main.integration.test.ts", "sync-main.test.ts", "task-registry.test.ts", "task-runner.execution-failure.test.ts", "task-runner.precondition-classification.test.ts", "task-runner.report-only-status.test.ts", "task-runner.test.ts", "triage-task.test.ts", "types.test.ts"]
---

## Summary

The maintenance test suite validates the orchestrator's background-job execution layer—cron scheduling, health checks, task dispatch, and PR lifecycle management. It tests the spawn-parse-timeout contract for `harness check-*` commands (architecture, docs, cleanup, etc.), the task scheduler, custom task validation, and CI integration. Key areas: check execution with 64MB buffer / 300s timeout, findings parsing from machine-readable contracts or regex fallback, task scheduling by cron/deadline, leader election for distributed runs, PR orchestration with agent dispatch and check gates, custom inline task validation, and automated issue triage.

## Invariants

- Findings contract (formatFindingsContract) is authoritative — takes precedence over regex-parsed counts; unmigrated checks fall back to regex only
- Timeout = executionFailed — SIGTERM/ETIMEDOUT/killed sets executionFailed:true; partial output flushed before signal is NOT trusted (findings reset to 0)
- Shared check constants — 64MB max buffer and 300s timeout apply to all cron and CLI check runs; tests verify both defaults and parameter overrides thread correctly
- Barrel exports are critical paths — TaskRunner, MaintenanceReporter, CheckScriptRunner, createAgentDispatcher, createBackend must be on main export (guards on-demand CLI)
- Non-zero exit ≠ execution failure — Exit code 1 with parseable findings is a successful run reporting issues; only spawn errors (ENOENT, timeout, unknown command) set executionFailed
- Script envelope JSON format — CheckScriptRunner parses JSON envelopes with status field; wakeAgent:true signals agent dispatch regardless of findings count
- Output preservation — Raw stdout (including envelope lines) is concatenated into result; envelope lines are not stripped

## Interface Contract

```ts

```

## Dependency Slice

```
import * as orch from '../../src/index'
import { ExecFileAsyncFn, MAINTENANCE_CHECK_MAX_BUFFER, MAINTENANCE_CHECK_TIMEOUT_MS, RunHarnessCheckOptions, isCheckTimeoutError, runHarnessCheck } from '../../src/maintenance/check-runner'
import { CheckScriptRunner, parseStatusEnvelope } from '../../src/maintenance/check-script-runner'
import { ContextResolver, InlineSkillReader } from '../../src/maintenance/context-resolver'
import { cronMatchesDate, cronMatchesNow } from '../../src/maintenance/cron-matcher'
import { CustomTaskValidationError, validateCustomTasks } from '../../src/maintenance/custom-task-validator'
import { LeaderElector, SingleProcessLeaderElector } from '../../src/maintenance/leader-elector'
import { PersistedOutputEntry, TaskOutputStore } from '../../src/maintenance/output-store'
import { previousFireTime, selectTasks } from '../../src/maintenance/overdue'
import { GhExecutor, GitExecutor, PRManager, PRManagerLogger, PRManagerOptions } from '../../src/maintenance/pr-manager'
import { MaintenanceReporter } from '../../src/maintenance/reporter'
import { MaintenanceScheduler } from '../../src/maintenance/scheduler'
import { ExecFileFn, SyncMainResult, syncMain } from '../../src/maintenance/sync-main'
import { BUILT_IN_TASKS } from '../../src/maintenance/task-registry'
import { AgentDispatcher, CheckCommandResult, CheckCommandRunner, CommandExecutor, PRLifecycleManager, TaskRunner, TaskRunnerOptions, classifyCheckExecutionFailure, recoverFindingsCount } from '../../src/maintenance/task-runner'
import { TRIAGE_TASK_ID, registerTriageTask, runTriageIfLeader } from '../../src/maintenance/triage-task'
import { MaintenanceStatus, RunResult, ScheduleEntry, TaskDefinition, TaskType } from '../../src/maintenance/types'
import { normalizeHarnessCommand } from '../../src/orchestrator'
import { MaintenanceRouteDeps, handleMaintenanceRoute, toMaintenanceHistoryEntry } from '../../src/server/routes/maintenance'
import { CheckScriptDefinition, CustomTaskDefinition, MaintenanceConfig, MaintenanceHistoryEntry, RoadmapAutoTriageConfig, formatFindingsContract } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import * as fs, { mkdtempSync, rmSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import * as os, { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import * as util from 'node:util'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
