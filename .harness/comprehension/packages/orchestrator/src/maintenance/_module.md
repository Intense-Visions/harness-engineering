---
schemaVersion: 1
module: 'packages/orchestrator/src/maintenance'
sourceHash: '824a7cfb079ef959470d21f58690d43cd7081456adb605778abd24aa8beb241b'
compiledAt: '2026-08-28T01:22:12.324Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'agent-dispatcher.test.ts',
    'agent-dispatcher.ts',
    'check-runner.ts',
    'check-script-runner.ts',
    'context-resolver.ts',
    'cron-matcher.ts',
    'custom-task-validator.ts',
    'index.ts',
    'leader-elector.ts',
    'output-store.ts',
    'overdue.ts',
    'pr-manager.ts',
    'reporter.ts',
    'scheduler.ts',
    'sync-main.ts',
    'task-registry.ts',
    'task-runner.ts',
    'triage-task.ts',
    'types.ts',
  ]
---

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
