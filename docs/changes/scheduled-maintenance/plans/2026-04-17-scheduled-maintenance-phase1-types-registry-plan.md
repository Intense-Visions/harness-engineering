# Plan: Scheduled Maintenance -- Phase 1: Types and Task Registry

**Date:** 2026-04-17 | **Spec:** docs/changes/scheduled-maintenance/proposal.md | **Tasks:** 6 | **Time:** ~25 min

## Goal

The types package exports `MaintenanceConfig` and `TaskOverride`, the orchestrator package contains internal maintenance types and a complete task registry with all 17 built-in task definitions, and `WorkflowConfig` accepts an optional `maintenance` property.

## Observable Truths (Acceptance Criteria)

1. When `import type { MaintenanceConfig, TaskOverride } from '@harness-engineering/types'` is written in a consuming file, the TypeScript compiler resolves both types without error.
2. The system shall expose `WorkflowConfig.maintenance` typed as `MaintenanceConfig | undefined` (optional property on the existing interface).
3. When `packages/orchestrator/src/maintenance/types.ts` is imported, it exports `TaskType`, `TaskDefinition`, `RunResult`, and `MaintenanceStatus`.
4. When `packages/orchestrator/src/maintenance/task-registry.ts` is imported, it exports a `BUILT_IN_TASKS` array containing exactly 17 `TaskDefinition` entries.
5. Each of the 17 task definitions has the correct `id`, `type`, `schedule`, and `branch` matching the spec tables.
6. When `npx vitest run tests/maintenance/` is executed in the orchestrator package, all tests pass.
7. When `harness validate` is executed, it passes.

## Decisions

| Decision                             | Choice                                            | Rationale                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MaintenanceConfig.aiBackend` type   | `string` (not `AgentBackend` interface)           | The spec says `default: 'local'` which is a string. `AgentConfig.backend` is already typed as `string`. The `AgentBackend` interface has methods and is not a config value. |
| Location of public maintenance types | `packages/types/src/maintenance.ts`               | Follows existing pattern: domain types in separate files (`ci.ts`, `roadmap.ts`, `telemetry.ts`), re-exported from `index.ts`.                                              |
| Task registry export shape           | `const BUILT_IN_TASKS: readonly TaskDefinition[]` | Readonly array prevents mutation. Consumers can look up by `id` or filter by `type`.                                                                                        |

## File Map

```
CREATE  packages/types/src/maintenance.ts
MODIFY  packages/types/src/orchestrator.ts          (add MaintenanceConfig to WorkflowConfig)
MODIFY  packages/types/src/index.ts                 (add maintenance exports)
CREATE  packages/orchestrator/src/maintenance/types.ts
CREATE  packages/orchestrator/src/maintenance/task-registry.ts
CREATE  packages/orchestrator/src/maintenance/index.ts
CREATE  packages/orchestrator/tests/maintenance/types.test.ts
CREATE  packages/orchestrator/tests/maintenance/task-registry.test.ts
```

## Tasks

### Task 1: Create public maintenance types in @harness-engineering/types

**Depends on:** none | **Files:** `packages/types/src/maintenance.ts`

1. Create `packages/types/src/maintenance.ts` with the following content:

```typescript
/**
 * Per-task overrides in the maintenance configuration.
 */
export interface TaskOverride {
  /** Whether this task is enabled (default: true) */
  enabled?: boolean;
  /** Cron expression override for this task's schedule */
  schedule?: string;
  /** Backend name override for AI tasks (e.g., 'local', 'claude') */
  aiBackend?: string;
}

/**
 * Configuration for the scheduled maintenance module.
 * Added as an optional property on WorkflowConfig.
 */
export interface MaintenanceConfig {
  /** Whether scheduled maintenance is enabled */
  enabled: boolean;
  /** Default AI backend name for maintenance tasks (default: 'local') */
  aiBackend?: string;
  /** Base branch for maintenance PRs (default: 'main') */
  baseBranch?: string;
  /** Prefix for maintenance branch names (default: 'harness-maint/') */
  branchPrefix?: string;
  /** TTL in ms for the leader election claim (default: 300000) */
  leaderClaimTTLMs?: number;
  /** How often in ms to evaluate cron schedules (default: 60000) */
  checkIntervalMs?: number;
  /** Per-task overrides keyed by task ID */
  tasks?: Record<string, TaskOverride>;
}
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering-maintenance && npx harness validate`
3. Commit: `feat(types): add MaintenanceConfig and TaskOverride types`

---

### Task 2: Wire MaintenanceConfig into WorkflowConfig and re-export from index

**Depends on:** Task 1 | **Files:** `packages/types/src/orchestrator.ts`, `packages/types/src/index.ts`

1. In `packages/types/src/orchestrator.ts`, add the import at the top (after the existing `import type { Result } from './result';`):

```typescript
import type { MaintenanceConfig } from './maintenance';
```

2. In `packages/types/src/orchestrator.ts`, add the `maintenance` property to `WorkflowConfig` (after the `intelligence?` line):

```typescript
  /** Scheduled maintenance settings */
  maintenance?: MaintenanceConfig;
```

3. In `packages/types/src/index.ts`, add a new section after the Orchestrator exports:

```typescript
// --- Maintenance ---
export type { MaintenanceConfig, TaskOverride } from './maintenance';
```

4. Run: `cd /Users/cwarner/Projects/harness-engineering-maintenance && npx tsc --noEmit -p packages/types/tsconfig.json`
5. Run: `cd /Users/cwarner/Projects/harness-engineering-maintenance && npx harness validate`
6. Commit: `feat(types): wire MaintenanceConfig into WorkflowConfig and export`

---

### Task 3: Create internal maintenance types in orchestrator package

**Depends on:** none (parallel with Tasks 1-2) | **Files:** `packages/orchestrator/src/maintenance/types.ts`

1. Create directory: `mkdir -p /Users/cwarner/Projects/harness-engineering-maintenance/packages/orchestrator/src/maintenance`
2. Create `packages/orchestrator/src/maintenance/types.ts` with the following content:

```typescript
/**
 * Internal types for the maintenance module.
 * Public config types (MaintenanceConfig, TaskOverride) live in @harness-engineering/types.
 */

/**
 * Classification of maintenance task execution strategy.
 *
 * - mechanical-ai: Run a check command first; dispatch AI agent only if fixable issues are found.
 * - pure-ai: Always dispatch an AI agent on schedule regardless of preconditions.
 * - report-only: Run a command and record metrics; never create branches or PRs.
 * - housekeeping: Run a mechanical command directly; no AI, no PR.
 */
export type TaskType = 'mechanical-ai' | 'pure-ai' | 'report-only' | 'housekeeping';

/**
 * Definition of a built-in maintenance task.
 */
export interface TaskDefinition {
  /** Unique identifier for this task (e.g., 'arch-violations') */
  id: string;
  /** Execution strategy */
  type: TaskType;
  /** Human-readable description */
  description: string;
  /** Default cron expression (e.g., '0 2 * * *' for daily at 2am) */
  schedule: string;
  /** Branch name for PRs, or null for report-only/housekeeping tasks */
  branch: string | null;
  /** CLI command args for the mechanical check step (mechanical-ai and report-only) */
  checkCommand?: string[];
  /** Skill name to dispatch for AI fix (mechanical-ai and pure-ai) */
  fixSkill?: string;
}

/**
 * Result of a single maintenance task run.
 */
export interface RunResult {
  /** ID of the task that was run */
  taskId: string;
  /** ISO timestamp when the run started */
  startedAt: string;
  /** ISO timestamp when the run completed */
  completedAt: string;
  /** Outcome of the run */
  status: 'success' | 'failure' | 'skipped' | 'no-issues';
  /** Number of issues/findings detected */
  findings: number;
  /** Number of issues fixed */
  fixed: number;
  /** URL of the created/updated PR, or null if no PR was created */
  prUrl: string | null;
  /** Whether an existing PR was updated (vs newly created) */
  prUpdated: boolean;
  /** Error message if status is 'failure' */
  error?: string;
}

/**
 * Schedule entry for a single task, used in MaintenanceStatus.
 */
export interface ScheduleEntry {
  /** Task identifier */
  taskId: string;
  /** ISO timestamp of the next scheduled run */
  nextRun: string;
  /** Result of the most recent run, or null if never run */
  lastRun: RunResult | null;
}

/**
 * Overall maintenance module status, exposed via dashboard API.
 */
export interface MaintenanceStatus {
  /** Whether this orchestrator instance is the maintenance leader */
  isLeader: boolean;
  /** ISO timestamp of the last successful leader claim, or null */
  lastLeaderClaim: string | null;
  /** Schedule state for all enabled tasks */
  schedule: ScheduleEntry[];
  /** Currently executing task, or null if idle */
  activeRun: { taskId: string; startedAt: string } | null;
  /** History of completed runs (most recent first) */
  history: RunResult[];
}
```

3. Run: `cd /Users/cwarner/Projects/harness-engineering-maintenance && npx harness validate`
4. Commit: `feat(orchestrator): add internal maintenance type definitions`

---

### Task 4: Create test file for internal types and task registry

**Depends on:** Task 3 | **Files:** `packages/orchestrator/tests/maintenance/types.test.ts`, `packages/orchestrator/tests/maintenance/task-registry.test.ts`

1. Create directory: `mkdir -p /Users/cwarner/Projects/harness-engineering-maintenance/packages/orchestrator/tests/maintenance`

2. Create `packages/orchestrator/tests/maintenance/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type {
  TaskType,
  TaskDefinition,
  RunResult,
  MaintenanceStatus,
  ScheduleEntry,
} from '../../src/maintenance/types';

describe('maintenance internal types', () => {
  it('TaskType accepts all four valid values', () => {
    const types: TaskType[] = ['mechanical-ai', 'pure-ai', 'report-only', 'housekeeping'];
    expect(types).toHaveLength(4);
  });

  it('TaskDefinition can be constructed with required fields', () => {
    const task: TaskDefinition = {
      id: 'test-task',
      type: 'mechanical-ai',
      description: 'A test task',
      schedule: '0 2 * * *',
      branch: 'harness-maint/test',
      checkCommand: ['check-arch'],
      fixSkill: 'harness-arch-fix',
    };
    expect(task.id).toBe('test-task');
    expect(task.type).toBe('mechanical-ai');
    expect(task.branch).toBe('harness-maint/test');
  });

  it('TaskDefinition allows null branch for report-only tasks', () => {
    const task: TaskDefinition = {
      id: 'report-task',
      type: 'report-only',
      description: 'A report task',
      schedule: '0 6 * * 1',
      branch: null,
      checkCommand: ['check-perf'],
    };
    expect(task.branch).toBeNull();
  });

  it('RunResult can represent a successful run with PR', () => {
    const result: RunResult = {
      taskId: 'arch-violations',
      startedAt: '2026-04-17T02:00:00Z',
      completedAt: '2026-04-17T02:05:00Z',
      status: 'success',
      findings: 3,
      fixed: 2,
      prUrl: 'https://github.com/org/repo/pull/42',
      prUpdated: false,
    };
    expect(result.status).toBe('success');
    expect(result.prUrl).not.toBeNull();
  });

  it('RunResult can represent a no-issues run', () => {
    const result: RunResult = {
      taskId: 'arch-violations',
      startedAt: '2026-04-17T02:00:00Z',
      completedAt: '2026-04-17T02:01:00Z',
      status: 'no-issues',
      findings: 0,
      fixed: 0,
      prUrl: null,
      prUpdated: false,
    };
    expect(result.status).toBe('no-issues');
    expect(result.findings).toBe(0);
  });

  it('RunResult can represent a failure with error', () => {
    const result: RunResult = {
      taskId: 'entropy',
      startedAt: '2026-04-17T03:00:00Z',
      completedAt: '2026-04-17T03:00:05Z',
      status: 'failure',
      findings: 0,
      fixed: 0,
      prUrl: null,
      prUpdated: false,
      error: 'Command exited with code 1',
    };
    expect(result.status).toBe('failure');
    expect(result.error).toBeDefined();
  });

  it('MaintenanceStatus represents idle state', () => {
    const status: MaintenanceStatus = {
      isLeader: true,
      lastLeaderClaim: '2026-04-17T02:00:00Z',
      schedule: [],
      activeRun: null,
      history: [],
    };
    expect(status.isLeader).toBe(true);
    expect(status.activeRun).toBeNull();
  });

  it('ScheduleEntry links a task to its next run and last result', () => {
    const entry: ScheduleEntry = {
      taskId: 'arch-violations',
      nextRun: '2026-04-18T02:00:00Z',
      lastRun: {
        taskId: 'arch-violations',
        startedAt: '2026-04-17T02:00:00Z',
        completedAt: '2026-04-17T02:05:00Z',
        status: 'success',
        findings: 3,
        fixed: 2,
        prUrl: 'https://github.com/org/repo/pull/42',
        prUpdated: true,
      },
    };
    expect(entry.taskId).toBe('arch-violations');
    expect(entry.lastRun?.status).toBe('success');
  });
});
```

3. Create `packages/orchestrator/tests/maintenance/task-registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BUILT_IN_TASKS } from '../../src/maintenance/task-registry';
import type { TaskDefinition, TaskType } from '../../src/maintenance/types';

describe('task-registry', () => {
  it('exports exactly 17 built-in task definitions', () => {
    expect(BUILT_IN_TASKS).toHaveLength(17);
  });

  it('every task has a unique id', () => {
    const ids = BUILT_IN_TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every task has a non-empty schedule (cron expression)', () => {
    for (const task of BUILT_IN_TASKS) {
      expect(task.schedule).toBeTruthy();
      // Basic cron format: 5 space-separated fields
      expect(task.schedule.split(' ')).toHaveLength(5);
    }
  });

  it('every task has a valid type', () => {
    const validTypes: TaskType[] = ['mechanical-ai', 'pure-ai', 'report-only', 'housekeeping'];
    for (const task of BUILT_IN_TASKS) {
      expect(validTypes).toContain(task.type);
    }
  });

  it('mechanical-ai tasks have checkCommand and fixSkill', () => {
    const mechanicalAi = BUILT_IN_TASKS.filter((t) => t.type === 'mechanical-ai');
    expect(mechanicalAi.length).toBe(7);
    for (const task of mechanicalAi) {
      expect(task.checkCommand).toBeDefined();
      expect(task.checkCommand!.length).toBeGreaterThan(0);
      expect(task.fixSkill).toBeDefined();
      expect(task.branch).not.toBeNull();
    }
  });

  it('pure-ai tasks have fixSkill and branch but no checkCommand', () => {
    const pureAi = BUILT_IN_TASKS.filter((t) => t.type === 'pure-ai');
    expect(pureAi.length).toBe(4);
    for (const task of pureAi) {
      expect(task.fixSkill).toBeDefined();
      expect(task.branch).not.toBeNull();
      expect(task.checkCommand).toBeUndefined();
    }
  });

  it('report-only tasks have checkCommand and null branch', () => {
    const reportOnly = BUILT_IN_TASKS.filter((t) => t.type === 'report-only');
    expect(reportOnly.length).toBe(4);
    for (const task of reportOnly) {
      expect(task.checkCommand).toBeDefined();
      expect(task.branch).toBeNull();
      expect(task.fixSkill).toBeUndefined();
    }
  });

  it('housekeeping tasks have checkCommand and null branch', () => {
    const housekeeping = BUILT_IN_TASKS.filter((t) => t.type === 'housekeeping');
    expect(housekeeping.length).toBe(2);
    for (const task of housekeeping) {
      expect(task.checkCommand).toBeDefined();
      expect(task.branch).toBeNull();
      expect(task.fixSkill).toBeUndefined();
    }
  });

  describe('specific task IDs and schedules from spec', () => {
    const taskMap = new Map<string, TaskDefinition>();
    for (const t of BUILT_IN_TASKS) {
      taskMap.set(t.id, t);
    }

    // Mechanical-AI tasks
    it('arch-violations: daily 2am, mechanical-ai', () => {
      const t = taskMap.get('arch-violations')!;
      expect(t.type).toBe('mechanical-ai');
      expect(t.schedule).toBe('0 2 * * *');
      expect(t.branch).toBe('harness-maint/arch-fixes');
      expect(t.checkCommand).toEqual(['check-arch']);
    });

    it('dep-violations: daily 2am, mechanical-ai', () => {
      const t = taskMap.get('dep-violations')!;
      expect(t.type).toBe('mechanical-ai');
      expect(t.schedule).toBe('0 2 * * *');
      expect(t.branch).toBe('harness-maint/dep-fixes');
      expect(t.checkCommand).toEqual(['check-deps']);
    });

    it('doc-drift: daily 3am, mechanical-ai', () => {
      const t = taskMap.get('doc-drift')!;
      expect(t.type).toBe('mechanical-ai');
      expect(t.schedule).toBe('0 3 * * *');
      expect(t.branch).toBe('harness-maint/doc-fixes');
    });

    it('security-findings: daily 1am, mechanical-ai', () => {
      const t = taskMap.get('security-findings')!;
      expect(t.type).toBe('mechanical-ai');
      expect(t.schedule).toBe('0 1 * * *');
      expect(t.branch).toBe('harness-maint/security-fixes');
    });

    it('entropy: daily 3am, mechanical-ai', () => {
      const t = taskMap.get('entropy')!;
      expect(t.type).toBe('mechanical-ai');
      expect(t.schedule).toBe('0 3 * * *');
      expect(t.branch).toBe('harness-maint/entropy-fixes');
    });

    it('traceability: weekly Monday 6am, mechanical-ai', () => {
      const t = taskMap.get('traceability')!;
      expect(t.type).toBe('mechanical-ai');
      expect(t.schedule).toBe('0 6 * * 1');
      expect(t.branch).toBe('harness-maint/traceability-fixes');
    });

    it('cross-check: weekly Monday 6am, mechanical-ai', () => {
      const t = taskMap.get('cross-check')!;
      expect(t.type).toBe('mechanical-ai');
      expect(t.schedule).toBe('0 6 * * 1');
      expect(t.branch).toBe('harness-maint/cross-check-fixes');
    });

    // Pure-AI tasks
    it('dead-code: weekly Sunday 2am, pure-ai', () => {
      const t = taskMap.get('dead-code')!;
      expect(t.type).toBe('pure-ai');
      expect(t.schedule).toBe('0 2 * * 0');
      expect(t.branch).toBe('harness-maint/dead-code');
    });

    it('dependency-health: weekly Sunday 3am, pure-ai', () => {
      const t = taskMap.get('dependency-health')!;
      expect(t.type).toBe('pure-ai');
      expect(t.schedule).toBe('0 3 * * 0');
      expect(t.branch).toBe('harness-maint/dep-health');
    });

    it('hotspot-remediation: weekly Sunday 4am, pure-ai', () => {
      const t = taskMap.get('hotspot-remediation')!;
      expect(t.type).toBe('pure-ai');
      expect(t.schedule).toBe('0 4 * * 0');
      expect(t.branch).toBe('harness-maint/hotspot-fixes');
    });

    it('security-review: weekly Sunday 1am, pure-ai', () => {
      const t = taskMap.get('security-review')!;
      expect(t.type).toBe('pure-ai');
      expect(t.schedule).toBe('0 1 * * 0');
      expect(t.branch).toBe('harness-maint/security-deep');
    });

    // Report-only tasks
    it('perf-check: weekly Monday 6am, report-only', () => {
      const t = taskMap.get('perf-check')!;
      expect(t.type).toBe('report-only');
      expect(t.schedule).toBe('0 6 * * 1');
      expect(t.branch).toBeNull();
    });

    it('decay-trends: weekly Monday 7am, report-only', () => {
      const t = taskMap.get('decay-trends')!;
      expect(t.type).toBe('report-only');
      expect(t.schedule).toBe('0 7 * * 1');
    });

    it('project-health: daily 6am, report-only', () => {
      const t = taskMap.get('project-health')!;
      expect(t.type).toBe('report-only');
      expect(t.schedule).toBe('0 6 * * *');
    });

    it('stale-constraints: monthly 1st 2am, report-only', () => {
      const t = taskMap.get('stale-constraints')!;
      expect(t.type).toBe('report-only');
      expect(t.schedule).toBe('0 2 1 * *');
    });

    // Housekeeping tasks
    it('session-cleanup: daily midnight, housekeeping', () => {
      const t = taskMap.get('session-cleanup')!;
      expect(t.type).toBe('housekeeping');
      expect(t.schedule).toBe('0 0 * * *');
      expect(t.branch).toBeNull();
    });

    it('perf-baselines: daily 7am, housekeeping', () => {
      const t = taskMap.get('perf-baselines')!;
      expect(t.type).toBe('housekeeping');
      expect(t.schedule).toBe('0 7 * * *');
      expect(t.branch).toBeNull();
    });

    // graph-refresh was in the spec report-only section but not yet tested
    it('graph-refresh: daily 1am, report-only', () => {
      const t = taskMap.get('graph-refresh')!;
      expect(t.type).toBe('report-only');
      expect(t.schedule).toBe('0 1 * * *');
      expect(t.branch).toBeNull();
    });
  });
});
```

4. Run tests (expect failures since implementation does not exist yet): `cd /Users/cwarner/Projects/harness-engineering-maintenance && npx vitest run tests/maintenance/ --config packages/orchestrator/vitest.config.ts 2>&1 | tail -5` -- confirm test files are found and fail due to missing imports.
5. Run: `cd /Users/cwarner/Projects/harness-engineering-maintenance && npx harness validate`
6. Commit: `test(orchestrator): add maintenance type and task-registry tests (red)`

---

### Task 5: Create task registry with all 17 built-in definitions

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/maintenance/task-registry.ts`

1. Create `packages/orchestrator/src/maintenance/task-registry.ts`:

```typescript
import type { TaskDefinition } from './types';

/**
 * All 17 built-in maintenance task definitions with default schedules.
 *
 * Tasks are grouped by type:
 * - mechanical-ai (7): Run check first, dispatch AI only if fixable issues found
 * - pure-ai (4): Always dispatch AI agent on schedule
 * - report-only (5): Run command, record metrics, no PR
 * - housekeeping (2): Mechanical command, no AI, no PR
 */
export const BUILT_IN_TASKS: readonly TaskDefinition[] = [
  // --- Mechanical-AI ---
  {
    id: 'arch-violations',
    type: 'mechanical-ai',
    description: 'Detect and fix architecture violations',
    schedule: '0 2 * * *',
    branch: 'harness-maint/arch-fixes',
    checkCommand: ['check-arch'],
    fixSkill: 'harness-arch-fix',
  },
  {
    id: 'dep-violations',
    type: 'mechanical-ai',
    description: 'Detect and fix dependency violations',
    schedule: '0 2 * * *',
    branch: 'harness-maint/dep-fixes',
    checkCommand: ['check-deps'],
    fixSkill: 'harness-dep-fix',
  },
  {
    id: 'doc-drift',
    type: 'mechanical-ai',
    description: 'Detect and fix documentation drift',
    schedule: '0 3 * * *',
    branch: 'harness-maint/doc-fixes',
    checkCommand: ['check-docs'],
    fixSkill: 'harness-doc-fix',
  },
  {
    id: 'security-findings',
    type: 'mechanical-ai',
    description: 'Detect and fix security findings',
    schedule: '0 1 * * *',
    branch: 'harness-maint/security-fixes',
    checkCommand: ['check-security'],
    fixSkill: 'harness-security-fix',
  },
  {
    id: 'entropy',
    type: 'mechanical-ai',
    description: 'Detect and fix codebase entropy',
    schedule: '0 3 * * *',
    branch: 'harness-maint/entropy-fixes',
    checkCommand: ['cleanup'],
    fixSkill: 'harness-entropy-fix',
  },
  {
    id: 'traceability',
    type: 'mechanical-ai',
    description: 'Detect and fix traceability gaps',
    schedule: '0 6 * * 1',
    branch: 'harness-maint/traceability-fixes',
    checkCommand: ['traceability'],
    fixSkill: 'harness-traceability-fix',
  },
  {
    id: 'cross-check',
    type: 'mechanical-ai',
    description: 'Detect and fix cross-check violations',
    schedule: '0 6 * * 1',
    branch: 'harness-maint/cross-check-fixes',
    checkCommand: ['validate-cross-check'],
    fixSkill: 'harness-cross-check-fix',
  },

  // --- Pure-AI ---
  {
    id: 'dead-code',
    type: 'pure-ai',
    description: 'Find and remove dead code',
    schedule: '0 2 * * 0',
    branch: 'harness-maint/dead-code',
    fixSkill: 'harness-codebase-cleanup',
  },
  {
    id: 'dependency-health',
    type: 'pure-ai',
    description: 'Assess and improve dependency health',
    schedule: '0 3 * * 0',
    branch: 'harness-maint/dep-health',
    fixSkill: 'harness-dependency-health',
  },
  {
    id: 'hotspot-remediation',
    type: 'pure-ai',
    description: 'Identify and remediate code hotspots',
    schedule: '0 4 * * 0',
    branch: 'harness-maint/hotspot-fixes',
    fixSkill: 'harness-hotspot-detector',
  },
  {
    id: 'security-review',
    type: 'pure-ai',
    description: 'Deep security review and fixes',
    schedule: '0 1 * * 0',
    branch: 'harness-maint/security-deep',
    fixSkill: 'harness-security-review',
  },

  // --- Report-only ---
  {
    id: 'perf-check',
    type: 'report-only',
    description: 'Run performance checks and record metrics',
    schedule: '0 6 * * 1',
    branch: null,
    checkCommand: ['check-perf'],
  },
  {
    id: 'decay-trends',
    type: 'report-only',
    description: 'Compute architecture decay trend metrics',
    schedule: '0 7 * * 1',
    branch: null,
    checkCommand: ['predict'],
  },
  {
    id: 'project-health',
    type: 'report-only',
    description: 'Assess overall project health',
    schedule: '0 6 * * *',
    branch: null,
    checkCommand: ['assess_project'],
  },
  {
    id: 'stale-constraints',
    type: 'report-only',
    description: 'Detect stale architectural constraints',
    schedule: '0 2 1 * *',
    branch: null,
    checkCommand: ['detect_stale_constraints'],
  },
  {
    id: 'graph-refresh',
    type: 'report-only',
    description: 'Refresh the knowledge graph',
    schedule: '0 1 * * *',
    branch: null,
    checkCommand: ['graph', 'scan'],
  },

  // --- Housekeeping ---
  {
    id: 'session-cleanup',
    type: 'housekeeping',
    description: 'Clean up stale orchestrator sessions',
    schedule: '0 0 * * *',
    branch: null,
    checkCommand: ['cleanup-sessions'],
  },
  {
    id: 'perf-baselines',
    type: 'housekeeping',
    description: 'Update performance baselines',
    schedule: '0 7 * * *',
    branch: null,
    checkCommand: ['perf', 'baselines', 'update'],
  },
] as const;
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering-maintenance && npx harness validate`
3. Commit: `feat(orchestrator): add task registry with 17 built-in maintenance tasks`

---

### Task 6: Create maintenance index.ts, run tests green, final validate

**Depends on:** Tasks 2, 4, 5 | **Files:** `packages/orchestrator/src/maintenance/index.ts`

1. Create `packages/orchestrator/src/maintenance/index.ts`:

```typescript
/**
 * Scheduled maintenance module — public exports.
 *
 * Phase 1 exports types and the task registry. Subsequent phases add:
 * - MaintenanceScheduler (Phase 2)
 * - TaskRunner (Phase 3)
 * - PRManager (Phase 4)
 * - Reporter (Phase 5)
 */

export type {
  TaskType,
  TaskDefinition,
  RunResult,
  ScheduleEntry,
  MaintenanceStatus,
} from './types';

export { BUILT_IN_TASKS } from './task-registry';
```

2. Run tests: `cd /Users/cwarner/Projects/harness-engineering-maintenance && npx vitest run tests/maintenance/ --config packages/orchestrator/vitest.config.ts`
3. Verify all tests pass (types.test.ts and task-registry.test.ts).
4. Run typecheck: `cd /Users/cwarner/Projects/harness-engineering-maintenance && npx tsc --noEmit -p packages/orchestrator/tsconfig.json`
5. Run: `cd /Users/cwarner/Projects/harness-engineering-maintenance && npx harness validate`
6. Commit: `feat(orchestrator): add maintenance module index and verify tests pass`
