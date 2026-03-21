# Code Reviewer Persona with Schema v2 Conditional Steps

**Date:** 2026-03-18
**Status:** Approved
**Keywords:** persona, code-review, schema-v2, conditional-steps, skill-executor, graduated-depth, review-artifact

## Overview

The harness code-review skill exists but has no persona to own the workflow end-to-end. When invoked, it falls through to the superpowers:code-reviewer agent — an external dependency that doesn't incorporate harness methodology. The persona system also lacks the ability to invoke skills directly or vary behavior based on trigger context.

### Goals

1. Create a `code-reviewer` persona that performs full AI-powered code review using harness methodology, replacing dependence on superpowers:code-reviewer
2. Evolve the persona schema to v2 with a polymorphic `steps` array supporting both commands and skills
3. Add `when` conditions to steps so personas can vary behavior by trigger context (graduated depth)
4. Build a `SkillExecutor` in the persona runner to invoke skills programmatically
5. Support context-dependent output: persisted review artifacts for CI, inline output for manual invocations

### Non-Goals

- Replacing the harness-code-review skill itself (the persona consumes it, doesn't replace it)
- Cross-platform agent dispatch (Gemini CLI support is future work)
- Automated review-learnings calibration (manual for now)

## Decisions

| Decision               | Choice                                                                    | Rationale                                                                                         |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Scope of code reviewer | Full AI-powered review (not just mechanical checks)                       | Must match or exceed superpowers:code-reviewer while incorporating harness methodology/ethos      |
| How skills are invoked | Extend persona runner with SkillExecutor                                  | Makes the persona system more powerful generally; future personas can also invoke skills directly |
| Trigger strategy       | Graduated depth — mechanical on commit, full review on PR, full on manual | Balances CI noise vs thoroughness; commit checks are fast gates, PR reviews are thorough          |
| Step model             | Polymorphic `steps` array with `when` conditions replacing `commands`     | Declarative, clean, supports graduated depth natively in the schema                               |
| Output strategy        | Context-dependent — persisted artifacts for CI, inline for manual         | CI runs need traceability; conversational runs need immediacy                                     |
| Schema versioning      | Bump to v2, auto-convert v1 `commands` for backward compat                | Avoids breaking existing personas while enabling new capabilities                                 |

## Technical Design

### Schema v2

```typescript
// New step types
type CommandStep = {
  command: string;
  when?: TriggerContext; // default: "always"
};

type SkillStep = {
  skill: string;
  when?: TriggerContext; // default: "always"
  output?: 'inline' | 'artifact' | 'auto'; // default: "auto"
};

type Step = CommandStep | SkillStep;

type TriggerContext = 'always' | 'on_pr' | 'on_commit' | 'on_review' | 'scheduled' | 'manual';
```

Persona YAML example (`agents/personas/code-reviewer.yaml`):

```yaml
version: 2
name: Code Reviewer
description: Full-lifecycle code review with harness methodology
role: >
  Perform AI-powered code review incorporating harness validation,
  architectural analysis, and project-specific calibration.
  Produces structured Strengths/Issues/Assessment output.
skills:
  - harness-code-review
steps:
  - command: validate
    when: always
  - command: check-deps
    when: always
  - command: check-docs
    when: on_pr
  - skill: harness-code-review
    when: on_pr
    output: auto
  - skill: harness-code-review
    when: manual
    output: auto
triggers:
  - event: on_pr
    conditions:
      paths: ['src/**', 'packages/**']
  - event: on_commit
    conditions:
      branches: ['main', 'develop']
config:
  severity: error
  autoFix: false
  timeout: 600000
outputs:
  agents-md: true
  ci-workflow: true
  runtime-config: true
```

### Backward Compatibility

v1 schemas auto-convert at load time:

```typescript
// In loader.ts
function normalizePersona(raw: unknown): Persona {
  if (raw.version === 1 && raw.commands) {
    return {
      ...raw,
      version: 2,
      steps: raw.commands.map((cmd) => ({ command: cmd, when: 'always' })),
    };
  }
  return raw;
}
```

The `PersonaSchema` accepts both v1 and v2, normalizing internally. Existing v1 YAML files continue to work without modification.

### SkillExecutor

New module: `packages/cli/src/persona/skill-executor.ts`

```typescript
export interface SkillExecutionContext {
  trigger: TriggerContext;
  projectPath: string;
  outputMode: 'inline' | 'artifact' | 'auto';
  // For review context
  baseSha?: string;
  headSha?: string;
}

export interface SkillExecutionResult {
  status: 'pass' | 'fail';
  output: string;
  artifactPath?: string; // set when output written to file
  durationMs: number;
}

export async function executeSkill(
  skillName: string,
  context: SkillExecutionContext
): Promise<SkillExecutionResult>;
```

The executor:

1. Loads the skill definition via existing `loadSkill()` from `packages/cli/src/skill/loader.ts`
2. Reads the skill's SKILL.md for the full methodology
3. Resolves output mode (`auto` → `artifact` if CI/non-interactive, `inline` otherwise)
4. Invokes the skill's commands and applies its review methodology
5. If artifact mode, writes to `.harness/reviews/YYYY-MM-DD-<short-sha>.md`

### Runner Changes

`packages/cli/src/persona/runner.ts` gains step filtering and skill dispatch:

```typescript
export interface StepExecutionContext {
  trigger: TriggerContext;
  commandExecutor: CommandExecutor;
  skillExecutor: typeof executeSkill;
  projectPath: string;
}

export async function runPersona(
  persona: Persona,
  context: StepExecutionContext
): Promise<PersonaRunReport> {
  const activeSteps = persona.steps.filter(
    (step) => step.when === 'always' || step.when === context.trigger
  );

  for (const step of activeSteps) {
    if ('command' in step) {
      // existing command execution
    } else if ('skill' in step) {
      // new skill execution path
    }
  }
}
```

The `PersonaRunReport` type extends to include skill results:

```typescript
type StepReport = {
  name: string;
  type: 'command' | 'skill';
  status: 'pass' | 'fail' | 'skipped';
  result?: unknown;
  artifactPath?: string;
  error?: string;
  durationMs: number;
};
```

### Review Artifact Format

Written to `.harness/reviews/YYYY-MM-DD-<short-sha>.md`:

```markdown
---
persona: code-reviewer
trigger: on_pr
sha: abc1234
date: 2026-03-18
assessment: request-changes
---

## Strengths

- ...

## Issues

### Critical

- ...

### Important

- ...

### Suggestions

- ...

## Assessment

Request Changes — [summary]

## Harness Checks

- validate: pass
- check-deps: pass
- check-docs: fail (docs/api.md drift detected)
```

### File Layout (new/modified)

```
packages/cli/src/persona/
  schema.ts              # v2 schema with steps, backward compat
  loader.ts              # normalizePersona for v1→v2
  runner.ts              # step filtering, skill dispatch
  skill-executor.ts      # NEW — SkillExecutor implementation
  generators/
    runtime.ts           # updated for steps
    agents-md.ts         # updated for steps + skill refs
    ci-workflow.ts        # updated for conditional triggers

agents/personas/
  code-reviewer.yaml     # NEW — the code reviewer persona

packages/cli/tests/persona/
  schema.test.ts         # v2 schema tests
  runner.test.ts         # step filtering + skill execution tests
  skill-executor.test.ts # NEW
  fixtures/
    v1-persona.yaml      # backward compat fixture
    v2-persona.yaml      # NEW fixture
```

## Success Criteria

1. **Code reviewer persona exists** — `agents/personas/code-reviewer.yaml` is a valid v2 persona that loads without error
2. **Schema v2 works** — personas with `steps` array and `when` conditions parse, validate, and execute correctly
3. **Backward compatibility** — all 3 existing v1 personas (architecture-enforcer, documentation-maintainer, entropy-cleaner) load and run identically without modification
4. **SkillExecutor invokes skills** — `executeSkill("harness-code-review", context)` loads the skill, applies its methodology, and returns structured output
5. **Graduated depth** — given `on_commit` trigger, only `validate` and `check-deps` run; given `on_pr` trigger, all steps including the skill run
6. **Artifact output** — CI/non-interactive runs produce `.harness/reviews/YYYY-MM-DD-<sha>.md` with the Strengths/Issues/Assessment format
7. **Inline output** — manual/conversational runs return the review inline without writing an artifact
8. **Harness checks pass** — `harness validate` passes with the new persona and schema changes in place
9. **No superpowers dependency** — the code reviewer persona performs its full review without dispatching to superpowers:code-reviewer
10. **Generators updated** — runtime, agents-md, and ci-workflow generators produce correct output for v2 personas with conditional steps

## Implementation Order

1. **Schema v2** — update `schema.ts` with the `steps` type, `when` conditions, and v1→v2 normalization in `loader.ts`. Update tests.
2. **Runner changes** — add step filtering by trigger context and the skill dispatch path in `runner.ts`. Update `PersonaRunReport` type. Update tests.
3. **SkillExecutor** — new `skill-executor.ts` module with `executeSkill()`, artifact writing logic, and output mode resolution. Add tests.
4. **Generator updates** — update runtime, agents-md, and ci-workflow generators to handle v2 steps with conditional triggers. Update tests.
5. **Code reviewer persona** — create `agents/personas/code-reviewer.yaml` with the graduated depth configuration. Validate with `harness validate`.
6. **Integration testing** — end-to-end test: load the code-reviewer persona, simulate `on_commit` (mechanical only) and `on_pr` (full review) triggers, verify correct step filtering and output.
