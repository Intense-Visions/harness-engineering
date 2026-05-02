# Plan: Soundness Review Skill Scaffold

**Date:** 2026-03-20
**Spec:** docs/changes/spec-plan-soundness-review/proposal.md
**Phase:** Phase 1 — Skill scaffold
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Create the `harness-soundness-review` skill with `skill.yaml` and `SKILL.md` defining two modes (spec, plan), the finding schema, and the convergence loop structure. No checks are implemented yet — just the skeleton.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/claude-code/harness-soundness-review/skill.yaml` exists and passes the `SkillMetadataSchema` validation (name, version, description, triggers, platforms, tools, cli, mcp, type, phases, state, depends_on all valid).
2. `agents/skills/claude-code/harness-soundness-review/SKILL.md` exists and contains all required sections (`## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`, `## Gates`, `## Escalation`).
3. `agents/skills/gemini-cli/harness-soundness-review/skill.yaml` is byte-identical to the claude-code copy.
4. `agents/skills/gemini-cli/harness-soundness-review/SKILL.md` is byte-identical to the claude-code copy.
5. The SKILL.md defines both modes (`--mode spec` and `--mode plan`) with their check IDs (S1-S7, P1-P7) listed but marked as not-yet-implemented.
6. The SKILL.md defines the `SoundnessFinding` schema (id, check, title, detail, severity, autoFixable, suggestedFix, evidence).
7. The SKILL.md defines the convergence loop structure (RUN CHECKS, AUTO-FIX, CONVERGENCE CHECK, SURFACE, CLEAN EXIT).
8. The skill.yaml declares `--mode` as a required arg with description.
9. `pnpm exec harness validate` passes after all files are written.
10. When the skill test suite runs (`cd packages/cli && pnpm exec vitest run ../../agents/skills/tests/`), all structure, schema, platform-parity, and references tests pass.

## File Map

- CREATE `agents/skills/claude-code/harness-soundness-review/skill.yaml`
- CREATE `agents/skills/claude-code/harness-soundness-review/SKILL.md`
- CREATE `agents/skills/gemini-cli/harness-soundness-review/skill.yaml` (copy of claude-code)
- CREATE `agents/skills/gemini-cli/harness-soundness-review/SKILL.md` (copy of claude-code)

## Tasks

### Task 1: Create skill.yaml for harness-soundness-review

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-soundness-review/skill.yaml`

1. Create directory `agents/skills/claude-code/harness-soundness-review/`.
2. Create `agents/skills/claude-code/harness-soundness-review/skill.yaml`:

```yaml
name: harness-soundness-review
version: '1.0.0'
description: Deep soundness analysis of specs and plans with auto-fix and convergence loop
cognitive_mode: meticulous-verifier
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
cli:
  command: harness skill run harness-soundness-review
  args:
    - name: path
      description: Project root path
      required: false
    - name: mode
      description: Review mode — "spec" for spec soundness or "plan" for plan soundness
      required: true
mcp:
  tool: run_skill
  input:
    skill: harness-soundness-review
    path: string
type: rigid
phases:
  - name: check
    description: Run all checks for the current mode and classify findings
    required: true
  - name: fix
    description: Auto-fix inferrable issues and log changes
    required: true
  - name: converge
    description: Re-run checks, compare issue counts, loop or stop
    required: true
  - name: surface
    description: Present remaining issues to user for resolution
    required: true
state:
  persistent: false
  files: []
depends_on:
  - harness-brainstorming
  - harness-planning
```

3. Run: `pnpm exec harness validate`
4. Commit: `feat(soundness-review): add skill.yaml for harness-soundness-review`

---

### Task 2: Create SKILL.md for harness-soundness-review

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-soundness-review/SKILL.md`

1. Create `agents/skills/claude-code/harness-soundness-review/SKILL.md` with the following content:

````markdown
# Harness Soundness Review

> Deep soundness analysis of specs and plans. Auto-fixes inferrable issues, surfaces design decisions to you. Runs automatically before sign-off — no extra commands needed.

## When to Use

- Automatically invoked by harness-brainstorming before spec sign-off (`--mode spec`)
- Automatically invoked by harness-planning before plan sign-off (`--mode plan`)
- Manually invoked to review a spec or plan on demand
- NOT for reviewing implementation code (use harness-code-review)
- NOT as a replacement for mechanical validation (harness validate, check-deps remain as-is)
- NOT in CI — this is a design-time skill

## Arguments

- **`--mode spec`** — Run spec-mode checks (S1-S7) against a draft spec. Invoked by harness-brainstorming.
- **`--mode plan`** — Run plan-mode checks (P1-P7) against a draft plan. Invoked by harness-planning.

## Process

### Iron Law

**No spec or plan may be signed off without a converged soundness review. Inferrable fixes are applied silently. Design decisions are always surfaced to the user.**

---

### Finding Schema

Every finding produced by a check conforms to this structure:

```json
{
  "id": "string — unique identifier for this finding",
  "check": "string — check ID, e.g. S1, P3",
  "title": "string — one-line summary",
  "detail": "string — full explanation with evidence",
  "severity": "error | warning — errors block sign-off, warnings are advisory",
  "autoFixable": "boolean — whether this can be fixed without user input",
  "suggestedFix": "string | undefined — what the auto-fix would do, or suggestion for user",
  "evidence": ["string[] — references to spec/plan sections, codebase files"]
}
```

---

### Phase 1: CHECK — Run All Checks for Current Mode

Execute all checks for the active mode. Classify each finding as `autoFixable: true` or `autoFixable: false`. Record the total issue count.

#### Spec Mode Checks (`--mode spec`)

| #   | Check                      | What it detects                                                                                | Auto-fixable?                                                 |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| S1  | Internal coherence         | Contradictions between decisions, technical design, and success criteria                       | No — surface to user                                          |
| S2  | Goal-criteria traceability | Goals without success criteria; orphan criteria not tied to any goal                           | Yes — add missing links, flag orphans                         |
| S3  | Unstated assumptions       | Implicit assumptions in the design not called out (e.g., single-tenant, always-online)         | Partially — infer and add obvious ones, surface ambiguous     |
| S4  | Requirement completeness   | Missing error cases, edge cases, failure modes; apply EARS patterns for unwanted-behavior gaps | Partially — add obvious error cases, surface design-dependent |
| S5  | Feasibility red flags      | Design depends on nonexistent codebase capabilities or incompatible patterns                   | No — surface to user with evidence                            |
| S6  | YAGNI re-scan              | Speculative features that crept in during conversation                                         | No — surface to user (removing features is a design decision) |
| S7  | Testability                | Vague success criteria that are not observable or measurable ("should be fast")                | Yes — add thresholds/specificity where inferrable             |

> **Status:** Not yet implemented. Check stubs will be added in Phase 2 of the implementation order.

#### Plan Mode Checks (`--mode plan`)

| #   | Check                  | What it detects                                                                     | Auto-fixable?                                                      |
| --- | ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| P1  | Spec-plan coverage     | Success criteria from spec with no corresponding task(s)                            | Yes — add missing tasks                                            |
| P2  | Task completeness      | Tasks missing clear inputs, outputs, or verification criteria                       | Yes — infer from context and fill in                               |
| P3  | Dependency correctness | Cycles in dependency graph; task B uses output of A but does not declare dependency | Yes — add missing dependency edges                                 |
| P4  | Ordering sanity        | Tasks touching same files scheduled in parallel; consumers before producers         | Yes — reorder                                                      |
| P5  | Risk coverage          | Spec risks without mitigation in plan (no task or explicit acceptance)              | Partially — add mitigation tasks for obvious risks, surface others |
| P6  | Scope drift            | Plan tasks not traceable to any spec requirement                                    | No — surface to user (might be intentional prerequisite work)      |
| P7  | Task-level feasibility | Tasks requiring decisions not made in brainstorming; tasks too vague to execute     | No — surface to user                                               |

> **Status:** Not yet implemented. Check stubs will be added in Phase 4 of the implementation order.

---

### Phase 2: FIX — Auto-Fix Inferrable Issues

For every finding where `autoFixable: true`:

1. Apply the fix to the spec or plan document in place.
2. Log what changed and why (visible to the user after convergence).
3. Do NOT prompt the user for auto-fixable issues — they are mechanical.

For findings where `autoFixable: false`: skip them in this phase. They will be surfaced in Phase 4.

> **Status:** Not yet implemented. Auto-fix logic will be added in Phase 3 (spec mode) and Phase 5 (plan mode) of the implementation order.

---

### Phase 3: CONVERGE — Re-Check and Loop

After auto-fixes are applied:

1. Re-run all checks for the current mode.
2. Compare the new issue count to the previous pass's issue count.
3. If the count **decreased**: go back to Phase 2 (FIX) and apply any new auto-fixes.
4. If the count is **unchanged**: stop looping. All remaining issues require user input.

This convergence-based termination prevents infinite loops. The loop stops when no progress is being made.

> **Status:** Not yet implemented. Convergence logic will be added in Phase 3 (spec mode) and Phase 5 (plan mode) of the implementation order.

---

### Phase 4: SURFACE — Present Remaining Issues

For all findings where `autoFixable: false` (or auto-fix was attempted but the issue persists):

1. Present each issue to the user with:
   - **What is wrong** — the finding title and detail
   - **Why it matters** — the severity and impact on spec/plan quality
   - **Suggested resolution** — concrete options the user can choose from
2. Wait for the user to resolve each issue.
3. After user resolution: loop back to Phase 1 (CHECK) to verify the fix and catch any cascading issues.

#### Clean Exit

When no issues remain (all checks pass, zero findings), return control to the parent skill (harness-brainstorming or harness-planning) for sign-off.

> **Status:** Not yet implemented. Surfacing UX will be added in Phase 8 of the implementation order.

---

### Codebase and Graph Integration

Checks that benefit from codebase awareness (S3, S5, P1, P3, P4) use these tools:

| Check | Without graph                        | With graph                                             |
| ----- | ------------------------------------ | ------------------------------------------------------ |
| S5    | Grep/glob for referenced patterns    | `query_graph` to verify dependencies exist             |
| S3    | Infer from codebase conventions      | `find_context_for` to surface related design decisions |
| P1    | Text matching criteria to tasks      | Graph traceability edges if available                  |
| P3    | Static analysis of task descriptions | `get_impact` to verify dependency completeness         |
| P4    | Parse file paths, detect conflicts   | Graph file ownership for accurate conflict detection   |

All checks produce useful results from document analysis and basic codebase reads alone. Graph adds precision but is never required.

## Harness Integration

- **`harness validate`** — Run before and after the soundness review to verify project health is maintained.
- **Parent skill invocation** — harness-brainstorming invokes `--mode spec` before sign-off; harness-planning invokes `--mode plan` before sign-off. (Integration lines to be added in Phase 7 of implementation.)
- **No new user commands** — Users invoke brainstorming and planning exactly as before. The soundness review is invisible until it surfaces an issue.
- **Graph queries** — When `.harness/graph/` exists, use `query_graph` and `get_impact` for enhanced feasibility and dependency checks. Fall back to file-based reads when no graph is available.

## Success Criteria

1. The skill.yaml passes schema validation with all required fields
2. The SKILL.md contains all required sections and passes structure tests
3. Both platform copies (claude-code, gemini-cli) are byte-identical and pass parity tests
4. The two modes (spec, plan) are defined with their check tables (S1-S7, P1-P7)
5. The `SoundnessFinding` schema is defined in the SKILL.md
6. The convergence loop structure (CHECK, FIX, CONVERGE, SURFACE, CLEAN EXIT) is documented
7. `harness validate` passes after all files are written
8. The skill test suite passes (structure, schema, platform-parity, references)

## Examples

### Example: Spec Mode Invocation (Skeleton)

**Context:** harness-brainstorming has drafted a spec and is about to sign off.

```
Invoking harness-soundness-review --mode spec...

Phase 1: CHECK
  Running S1 (internal coherence)... [not yet implemented]
  Running S2 (goal-criteria traceability)... [not yet implemented]
  Running S3 (unstated assumptions)... [not yet implemented]
  Running S4 (requirement completeness)... [not yet implemented]
  Running S5 (feasibility red flags)... [not yet implemented]
  Running S6 (YAGNI re-scan)... [not yet implemented]
  Running S7 (testability)... [not yet implemented]

  0 findings. All checks are stubs — no issues detected.

Phase 2: FIX
  No auto-fixable findings.

Phase 3: CONVERGE
  Issue count unchanged (0). Converged.

Phase 4: SURFACE
  No remaining issues.

CLEAN EXIT — returning control to harness-brainstorming for sign-off.
```

### Example: Plan Mode Invocation (Skeleton)

**Context:** harness-planning has drafted a plan and is about to sign off.

```
Invoking harness-soundness-review --mode plan...

Phase 1: CHECK
  Running P1 (spec-plan coverage)... [not yet implemented]
  Running P2 (task completeness)... [not yet implemented]
  Running P3 (dependency correctness)... [not yet implemented]
  Running P4 (ordering sanity)... [not yet implemented]
  Running P5 (risk coverage)... [not yet implemented]
  Running P6 (scope drift)... [not yet implemented]
  Running P7 (task-level feasibility)... [not yet implemented]

  0 findings. All checks are stubs — no issues detected.

Phase 2: FIX
  No auto-fixable findings.

Phase 3: CONVERGE
  Issue count unchanged (0). Converged.

Phase 4: SURFACE
  No remaining issues.

CLEAN EXIT — returning control to harness-planning for sign-off.
```

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No sign-off without convergence.** The soundness review must reach a clean exit (zero findings) before the parent skill proceeds to write the spec or plan. If issues remain, the user must resolve them.
- **No silent resolution of design decisions.** Contradictions (S1), feasibility concerns (S5), YAGNI violations (S6), scope drift (P6), and task-level feasibility (P7) are NEVER auto-fixed. The user must always decide.
- **No auto-fix without logging.** Every auto-fix must be logged with what changed and why. Silent, unlogged mutations are not allowed.
- **Convergence must terminate.** The loop stops when issue count stops decreasing. There is no retry cap — but "no progress" is the hard stop.

## Escalation

- **When the spec or plan is too large for a single pass:** Break the document into sections and run checks section by section. Present findings grouped by section.
- **When a check produces false positives:** Log the false positive and skip it. Do not block sign-off on a finding that the user has explicitly dismissed.
- **When the convergence loop makes no progress on the first iteration:** All remaining findings need user input. Skip directly to Phase 4 (SURFACE) without looping.
- **When graph queries are unavailable:** Fall back to document analysis and codebase reads. All checks are designed to work without graph. Do not block or warn about missing graph — just use the fallback path.
````

3. Run: `pnpm exec harness validate`
4. Commit: `feat(soundness-review): add SKILL.md for harness-soundness-review`

---

### Task 3: Create gemini-cli platform copies

**Depends on:** Task 1, Task 2
**Files:** `agents/skills/gemini-cli/harness-soundness-review/skill.yaml`, `agents/skills/gemini-cli/harness-soundness-review/SKILL.md`

1. Create directory `agents/skills/gemini-cli/harness-soundness-review/`.
2. Copy `agents/skills/claude-code/harness-soundness-review/skill.yaml` to `agents/skills/gemini-cli/harness-soundness-review/skill.yaml`.
3. Copy `agents/skills/claude-code/harness-soundness-review/SKILL.md` to `agents/skills/gemini-cli/harness-soundness-review/SKILL.md`.
4. Verify byte-identical: `diff agents/skills/claude-code/harness-soundness-review/skill.yaml agents/skills/gemini-cli/harness-soundness-review/skill.yaml`
5. Verify byte-identical: `diff agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md`
6. Run: `pnpm exec harness validate`
7. Commit: `feat(soundness-review): add gemini-cli platform copies`

**Important:** Stage all 4 files (both platforms, both skill.yaml and SKILL.md) together to ensure Prettier formats them identically and preserves parity. If committing Tasks 1-3 together, that is acceptable and preferred.

---

### Task 4: Run skill test suite and verify

[checkpoint:human-verify]

**Depends on:** Task 3
**Files:** none (verification only)

1. Run skill tests: `cd packages/cli && pnpm exec vitest run ../../agents/skills/tests/`
2. Verify:
   - `structure.test.ts` — `harness-soundness-review` SKILL.md has all required sections (When to Use, Process, Harness Integration, Success Criteria, Examples) and rigid sections (Gates, Escalation)
   - `schema.test.ts` — `harness-soundness-review` skill.yaml passes `SkillMetadataSchema` validation
   - `platform-parity.test.ts` — claude-code and gemini-cli copies are byte-identical
   - `references.test.ts` — no broken cross-references
3. Run: `pnpm exec harness validate`
4. Run: `pnpm exec harness check-deps`
5. Report test count delta to user (expect ~8-16 new tests from the 2 new skill directories across 2 platforms).
