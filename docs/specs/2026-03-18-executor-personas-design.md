# Task Executor and Parallel Coordinator Personas

**Date:** 2026-03-18
**Status:** Approved
**Keywords:** persona, task-executor, parallel-coordinator, on_plan_approved, handoff, gsd-executor, worktree, skill-dispatch

## Overview

The harness-execution and harness-parallel-agents skills exist but have no personas to own their workflows. When execution is needed, GSD fills the gap with its own `gsd-executor` agents that don't incorporate harness methodology. The planning-to-execution handoff requires manual invocation — there's no automated trigger when a plan is approved.

### Goals

1. Create a `task-executor` persona that executes plans using harness-execution methodology, replacing dependence on gsd-executor
2. Create a `parallel-coordinator` persona that dispatches independent work across isolated Task Executor instances
3. Add `on_plan_approved` to `TriggerContext` to formalize the planning-to-execution handoff
4. Implement convention-based trigger detection: `.harness/handoff.json` with `fromSkill: "harness-planning"` and non-empty `pending` array

### Non-Goals

- Building an event bus (future work if more event types are needed)
- Cross-platform agent dispatch (Gemini CLI worktree support is future work)
- Replacing the harness-execution or harness-parallel-agents skills (the personas consume them)
- Modifying the planning skill's handoff format (it already writes what we need)

## Decisions

| Decision                             | Choice                                                                                               | Rationale                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Number of personas                   | Two: Task Executor + Parallel Coordinator                                                            | Clean separation of concerns — execution discipline vs orchestration                          |
| Trigger for auto-execution           | `on_plan_approved` convention-based trigger                                                          | Formalizes the existing planning-to-execution handoff without building an event bus           |
| Trigger detection mechanism          | Check `.harness/handoff.json` for `fromSkill: "harness-planning"` + non-empty `pending`              | Contract already exists — planning skill writes this today                                    |
| Coordinator-to-Executor relationship | Coordinator dispatches Task Executor persona instances                                               | Executor is reusable standalone or as a parallel worker; gets state/TDD/verification for free |
| Worktree management                  | Delegated to platform (`isolation: "worktree"`)                                                      | Portable across Claude Code / Gemini CLI; avoids reimplementing platform capabilities         |
| Scope of each persona                | Executor: plan execution + verification. Coordinator: independence checking + dispatch + integration | Neither persona knows about the other's internals — dependency inversion                      |

## Technical Design

### TriggerContext Extension

Add `on_plan_approved` to the existing enum in `schema.ts`:

```typescript
export const TriggerContextSchema = z
  .enum(['always', 'on_pr', 'on_commit', 'on_review', 'scheduled', 'manual', 'on_plan_approved'])
  .default('always');
```

### Trigger Detection

New module: `packages/cli/src/persona/trigger-detector.ts`

```typescript
export interface TriggerDetectionResult {
  trigger: TriggerContext;
  handoff?: HandoffContext;
}

export interface HandoffContext {
  fromSkill: string;
  summary: string;
  pending: string[];
  planPath?: string;
}

export function detectTrigger(projectPath: string): TriggerDetectionResult {
  // Check for handoff.json
  const handoffPath = path.join(projectPath, '.harness', 'handoff.json');
  if (!fs.existsSync(handoffPath)) {
    return { trigger: 'manual' };
  }

  const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf-8'));

  if (
    handoff.fromSkill === 'harness-planning' &&
    Array.isArray(handoff.pending) &&
    handoff.pending.length > 0
  ) {
    return {
      trigger: 'on_plan_approved',
      handoff: {
        fromSkill: handoff.fromSkill,
        summary: handoff.summary ?? '',
        pending: handoff.pending,
        planPath: handoff.planPath,
      },
    };
  }

  return { trigger: 'manual' };
}
```

The runner calls `detectTrigger` when no explicit trigger is provided, enabling auto-detection from project state.

### Runner Integration

Update `StepExecutionContext` to accept auto-detect mode:

```typescript
export interface StepExecutionContext {
  trigger: TriggerContext | 'auto'; // 'auto' runs detectTrigger
  commandExecutor: CommandExecutor;
  skillExecutor: SkillExecutor;
  projectPath: string;
  handoff?: HandoffContext; // populated when trigger is on_plan_approved
}
```

When `trigger: 'auto'`, the runner calls `detectTrigger(context.projectPath)` and uses the result. The resolved `HandoffContext` is passed through to skill steps so the executor has plan context.

### SkillExecutor Extension

The `SkillExecutionContext` gains an optional `handoff` field:

```typescript
export interface SkillExecutionContext {
  trigger: TriggerContext;
  projectPath: string;
  outputMode: 'inline' | 'artifact' | 'auto';
  baseSha?: string;
  headSha?: string;
  handoff?: HandoffContext; // plan context from trigger detection
}
```

### Task Executor Persona

`agents/personas/task-executor.yaml`:

```yaml
version: 2
name: Task Executor
description: Executes approved plans with state tracking, TDD, and verification
role: >
  Execute implementation plans task-by-task using harness methodology.
  Maintains persistent state, follows TDD rhythm, runs verification
  after each task, and respects checkpoint protocol.
skills:
  - harness-execution
steps:
  - command: validate
    when: always
  - command: check-deps
    when: always
  - skill: harness-execution
    when: on_plan_approved
    output: auto
  - skill: harness-execution
    when: manual
    output: auto
triggers:
  - event: on_pr
    conditions:
      paths:
        - 'src/**'
        - 'packages/**'
  - event: on_commit
    conditions:
      branches:
        - main
        - develop
config:
  severity: error
  autoFix: false
  timeout: 900000
outputs:
  agents-md: true
  ci-workflow: true
  runtime-config: true
```

### Parallel Coordinator Persona

`agents/personas/parallel-coordinator.yaml`:

```yaml
version: 2
name: Parallel Coordinator
description: Dispatches independent work across isolated Task Executor instances
role: >
  Verify task independence, create focused agent briefs, dispatch
  Task Executor instances in isolated worktrees, integrate results,
  and run full validation after all agents complete.
skills:
  - harness-parallel-agents
steps:
  - command: validate
    when: always
  - skill: harness-parallel-agents
    when: manual
    output: inline
triggers:
  - event: on_pr
    conditions:
      paths:
        - 'src/**'
        - 'packages/**'
config:
  severity: error
  autoFix: false
  timeout: 1800000
outputs:
  agents-md: true
  ci-workflow: true
  runtime-config: true
```

### Agent Run Command Update

The `--trigger` option gains `auto` as a value and defaults to it:

```
harness agent run --persona task-executor                    # auto-detect trigger
harness agent run --persona task-executor --trigger manual   # force manual
harness agent run --persona parallel-coordinator             # always manual
```

### File Layout (new/modified)

```
CREATE packages/cli/src/persona/trigger-detector.ts
CREATE packages/cli/tests/persona/trigger-detector.test.ts
CREATE packages/cli/tests/persona/fixtures/handoff-planning.json
MODIFY packages/cli/src/persona/schema.ts
MODIFY packages/cli/src/persona/runner.ts
MODIFY packages/cli/src/persona/skill-executor.ts
MODIFY packages/cli/src/commands/agent/run.ts
MODIFY packages/cli/src/index.ts
MODIFY packages/mcp-server/src/tools/persona.ts
CREATE agents/personas/task-executor.yaml
CREATE agents/personas/parallel-coordinator.yaml
MODIFY packages/cli/tests/persona/schema.test.ts
MODIFY packages/cli/tests/persona/runner.test.ts
MODIFY packages/cli/tests/persona/builtins.test.ts
```

## Success Criteria

1. **Task Executor persona exists** — `agents/personas/task-executor.yaml` loads as a valid v2 persona
2. **Parallel Coordinator persona exists** — `agents/personas/parallel-coordinator.yaml` loads as a valid v2 persona
3. **`on_plan_approved` trigger works** — when `.harness/handoff.json` contains `fromSkill: "harness-planning"` with non-empty `pending`, `detectTrigger` returns `on_plan_approved`
4. **Auto-detection works** — `harness agent run --persona task-executor` without `--trigger` auto-detects from handoff.json
5. **Manual fallback** — when no handoff.json exists, trigger resolves to `manual`
6. **Handoff context passes through** — the `HandoffContext` (summary, pending tasks, plan path) is available to the skill executor
7. **Step filtering respects new trigger** — Task Executor with `on_plan_approved` trigger runs the execution skill step; with `on_commit` trigger runs only mechanical checks
8. **Parallel Coordinator is manual-only** — the coordinator's skill step only runs on `manual` trigger
9. **Backward compatibility** — all existing personas and tests continue to work unchanged
10. **All builtins load** — `listPersonas` returns 6 personas (3 original + code-reviewer + task-executor + parallel-coordinator)
11. **Existing tests pass** — 329+ CLI tests pass with no regressions

## Implementation Order

1. **Schema extension** — add `on_plan_approved` to `TriggerContextSchema` enum. Update schema tests.
2. **Trigger detector** — new `trigger-detector.ts` module with `detectTrigger()` and `HandoffContext` type. Add tests with fixture handoff JSON.
3. **Runner integration** — support `trigger: 'auto'` in `StepExecutionContext`, call `detectTrigger` when auto, pass `HandoffContext` through to skill steps.
4. **SkillExecutor extension** — add optional `handoff` field to `SkillExecutionContext`.
5. **Agent run command** — default `--trigger` to `auto`, update MCP handler similarly.
6. **Export updates** — export `detectTrigger`, `HandoffContext`, `TriggerDetectionResult` from index.ts.
7. **Task Executor persona** — create `agents/personas/task-executor.yaml`.
8. **Parallel Coordinator persona** — create `agents/personas/parallel-coordinator.yaml`.
9. **Builtins test update** — update persona count to 6.
