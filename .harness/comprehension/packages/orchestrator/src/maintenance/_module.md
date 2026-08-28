---
schemaVersion: 1
module: "packages/orchestrator/src/maintenance"
sourceHash: "824a7cfb079ef959470d21f58690d43cd7081456adb605778abd24aa8beb241b"
compiledAt: "2026-08-28T01:22:12.324Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["agent-dispatcher.test.ts", "agent-dispatcher.ts", "check-runner.ts", "check-script-runner.ts", "context-resolver.ts", "cron-matcher.ts", "custom-task-validator.ts", "index.ts", "leader-elector.ts", "output-store.ts", "overdue.ts", "pr-manager.ts", "reporter.ts", "scheduler.ts", "sync-main.ts", "task-registry.ts", "task-runner.ts", "triage-task.ts", "types.ts"]
---

## Summary

The maintenance module (`packages/orchestrator/src/maintenance`) is a scheduled maintenance orchestrator that runs periodic automated tasks to keep the codebase healthy. It combines cron-based scheduling with leader election, four execution strategies (mechanical-ai, pure-ai, report-only, housekeeping), 24 built-in tasks (architecture checks, security, docs, entropy, dead code, etc.), and branch/PR lifecycle management. Custom tasks extend the system via config with arbitrary check scripts, inlined skill context, upstream output injection, and retention policies. TaskRunner executes tasks by type without throwing errors, capturing all outcomes in RunResult. Findings are parsed from machine-readable contracts with regex fallback. Only the elected leader runs scheduled tasks; single-process deployments always grant leadership via SingleProcessLeaderElector.

## Invariants

- Leader election is exclusive — only the elected leader runs scheduled tasks; single-process deployments always grant leadership
- Tasks never throw — all errors (check failure, agent crash, git conflict) are captured in RunResult with appropriate status
- Mechanical-AI dispatches only on findings — a clean check (zero issues) skips agent dispatch entirely
- Execution windows prevent re-runs — lastRunMinute tracking prevents the same task firing twice within one minute
- Check execution failure is distinct from check findings — executionFailed: true maps to status: 'failure', never masking as a successful 0-finding run
- PR creation requires task.branch — report-only and housekeeping tasks have branch: null and never create PRs
- Branch rebasing is conflict-aware — on rebase failure, the branch is recreated from base rather than abandoned
- Findings parsing follows a cascade — machine-readable contract JSON (findingsSource: 'contract') wins on both clean and non-zero exits; regex parse is fallback for legacy checks (#691)
- Task config merges in order — built-in tasks are seeded, then overridden by config.tasks.<id>.*, then custom tasks appended; enabled: false filters tasks out
- Custom tasks are opt-in phases — checkScript, inlineSkills, contextFrom, outputRetention are populated only for isCustom: true; built-ins leave these unset

## Interface Contract

```ts
export AgentDispatchResult
export AgentDispatcher
export BUILT_IN_TASKS
export CheckCommandResult
export CheckCommandRunner
export CommandExecResult
export CommandExecutor
export EnsureBranchResult
export EnsurePRResult
export GhExecutor
export GitExecutor
export LeaderElector
export MaintenanceLogger
export MaintenanceReporter
export MaintenanceReporterOptions
export MaintenanceScheduler
export MaintenanceSchedulerOptions
export MaintenanceStatus
export PRLifecycleManager
export PRManager
export PRManagerLogger
export PRManagerOptions
export RegisteredTriageTask
export RunHistoryProvider
export RunResult
export ScheduleEntry
export SchedulerLogger
export SingleProcessLeaderElector
export SyncMainOptions
export SyncMainResult
export SyncSkipReason
export TRIAGE_TASK_ID
export TaskDefinition
export TaskRunner
export TaskRunnerOptions
export TaskSelectionFilter
export TaskType
export TriageJobBody
export cronMatchesNow
export previousFireTime
export registerTriageTask
export runTriageIfLeader
export selectTasks
export syncMain
```

## Dependency Slice

```
import { MockBackend } from '../agent/backends/mock'
import { AgentRunner } from '../agent/runner'
import { createAgentDispatcher } from './agent-dispatcher'
import { CheckScriptResult, CheckScriptRunner } from './check-script-runner'
import { ContextResolver } from './context-resolver'
import { cronMatchesDate, cronMatchesNow } from './cron-matcher'
import { LeaderElector } from './leader-elector'
import { PersistedOutputEntry, TaskOutputStore } from './output-store'
import { MaintenanceLogger } from './scheduler'
import { BUILT_IN_TASKS } from './task-registry'
import { AgentDispatchResult, AgentDispatcher, CheckCommandResult } from './task-runner'
import { MaintenanceStatus, RunMode, RunOrigin, RunResult, ScheduleEntry, TaskDefinition, TaskType } from './types'
import { AgentBackend, CheckScriptDefinition, CustomTaskDefinition, Err, Issue, MaintenanceConfig, Ok, OutputRetentionConfig, Result, RoadmapAutoTriageConfig, parseFindingsContract } from '@harness-engineering/types'
import { execFile, nodeExecFile } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { promisify } from 'node:util'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
