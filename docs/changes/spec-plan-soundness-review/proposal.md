# Spec & Plan Soundness Review

**Date:** 2026-03-20
**Status:** Proposed
**Skill:** `harness-soundness-review` (new), with integration into `harness-brainstorming` and `harness-planning`
**Keywords:** soundness, spec-review, plan-review, coherence, traceability, feasibility, convergence-loop, auto-fix

## Overview

A new skill that deeply analyzes specs and plans for internal soundness, automatically fixing inferrable issues and surfacing design decisions to the user. Invoked automatically by brainstorming (spec mode) and planning (plan mode) before sign-off — no extra commands needed.

### Non-goals

- Replacing existing mechanical validation (`harness validate`, `check-deps`, etc.) — those remain as-is
- Reviewing implementation code — that's `harness-code-review`'s job
- Running in CI — this is a design-time skill, not a gate (though the checks could inform a future CI gate)

## Decisions

| Decision          | Choice                                                                            | Rationale                                                                          |
| ----------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Insertion point   | End of both brainstorming and planning, automatically                             | Different checks at each stage; spec can be sound but plan can still miss coverage |
| Skill structure   | New shared skill (`harness-soundness-review`) with `--mode spec` / `--mode plan`  | Single source of truth for review/fix/converge pattern; reusable by future skills  |
| Auto-fix behavior | Fix inferrable issues silently; surface design decisions to user                  | Don't waste user attention on mechanical fixes; never silently resolve ambiguity   |
| Loop termination  | Convergence-based — stop when no progress or all remaining issues need user input | More principled than arbitrary cap; "no progress" check prevents infinite loops    |
| Toolset           | Full — document analysis + codebase reads + graph queries with graceful fallback  | Graph enhances feasibility/architecture checks but isn't required                  |
| Integration       | Brainstorming/planning SKILL.md files add one invocation line before sign-off     | Zero new commands for users; it just happens                                       |

## Technical Design

### Skill Modes

**Spec mode** (`--mode spec`) — invoked by brainstorming before sign-off:

| #   | Check                      | What it detects                                                                                  | Auto-fixable?                                                      |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| S1  | Internal coherence         | Contradictions between decisions, technical design, and success criteria                         | No — surface to user                                               |
| S2  | Goal→criteria traceability | Goals without success criteria; orphan criteria not tied to any goal                             | Yes — add missing links, flag orphans                              |
| S3  | Unstated assumptions       | Implicit assumptions in the design not called out (e.g., single-tenant, always-online)           | Partially — infer and add obvious ones, surface ambiguous ones     |
| S4  | Requirement completeness   | Missing error cases, edge cases, failure modes; apply EARS patterns for "unwanted behavior" gaps | Partially — add obvious error cases, surface design-dependent ones |
| S5  | Feasibility red flags      | Design depends on nonexistent codebase capabilities or incompatible patterns                     | No — surface to user with evidence                                 |
| S6  | YAGNI re-scan              | Speculative features that crept in during conversation                                           | No — surface to user (removing features is a design decision)      |
| S7  | Testability                | Vague success criteria that aren't observable or measurable ("should be fast")                   | Yes — add thresholds/specificity where inferrable                  |

**Plan mode** (`--mode plan`) — invoked by planning before sign-off:

| #   | Check                  | What it detects                                                                    | Auto-fixable?                                                              |
| --- | ---------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| P1  | Spec→plan coverage     | Success criteria from spec with no corresponding task(s)                           | Yes — add missing tasks                                                    |
| P2  | Task completeness      | Tasks missing clear inputs, outputs, or verification criteria                      | Yes — infer from context and fill in                                       |
| P3  | Dependency correctness | Cycles in dependency graph; task B uses output of A but doesn't declare dependency | Yes — add missing dependency edges                                         |
| P4  | Ordering sanity        | Tasks touching same files scheduled in parallel; consumers before producers        | Yes — reorder                                                              |
| P5  | Risk coverage          | Spec risks without mitigation in plan (no task or explicit acceptance)             | Partially — add mitigation tasks for obvious risks, surface judgment calls |
| P6  | Scope drift            | Plan tasks not traceable to any spec requirement                                   | No — surface to user (might be intentional prerequisite work)              |
| P7  | Task-level feasibility | Tasks requiring decisions not made in brainstorming; tasks too vague to execute    | No — surface to user                                                       |

### Convergence Loop

```
┌────────────────────────────────────────────────┐
│ 1. RUN CHECKS                                   │
│    - Execute all checks for current mode         │
│    - Classify each finding:                      │
│      auto-fixable | needs-user-input             │
│    - Record issue count                          │
├────────────────────────────────────────────────┤
│ 2. AUTO-FIX                                      │
│    - Apply fixes for all auto-fixable findings   │
│    - Update the spec/plan document in place       │
│    - Log each fix (what changed, why)            │
├────────────────────────────────────────────────┤
│ 3. CONVERGENCE CHECK                             │
│    - Re-run checks                               │
│    - Compare issue count to previous pass         │
│    - If count decreased → go to step 2           │
│    - If count unchanged → stop, surface remaining│
├────────────────────────────────────────────────┤
│ 4. SURFACE                                       │
│    - Present remaining issues to user             │
│    - For each: what's wrong, why it matters,     │
│      suggested resolution options                │
│    - User resolves; loop resumes from step 1     │
├────────────────────────────────────────────────┤
│ 5. CLEAN EXIT                                    │
│    - No issues remain                            │
│    - Return control to parent skill (sign-off)   │
└────────────────────────────────────────────────┘
```

### Finding Schema

```typescript
interface SoundnessFinding {
  id: string;
  check: string; // e.g., "S1", "P3"
  title: string; // one-line summary
  detail: string; // full explanation with evidence
  severity: 'error' | 'warning'; // errors block sign-off, warnings are advisory
  autoFixable: boolean;
  suggestedFix?: string; // what the auto-fix would do, or suggestion for user
  evidence: string[]; // references to spec/plan sections, codebase files
}
```

### Codebase & Graph Integration

| Check                   | Without graph                                                   | With graph                                                                                     |
| ----------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| S5 (Feasibility)        | Grep/glob for referenced patterns, read relevant files          | `query_graph` to verify dependencies exist, `get_relationships` for architecture compatibility |
| S3 (Assumptions)        | Infer from codebase conventions via file reads                  | `find_context_for` to surface related design decisions                                         |
| P1 (Spec→plan coverage) | Text matching between spec criteria and plan tasks              | Graph traceability edges if available                                                          |
| P3 (Dependencies)       | Static analysis of task descriptions for file/output references | `get_impact` to verify dependency completeness                                                 |
| P4 (Ordering)           | Parse file paths from task descriptions, detect conflicts       | Graph file ownership for accurate conflict detection                                           |

Fallback: all checks produce useful results from document analysis + basic codebase reads alone. Graph adds precision but is never required.

### Integration into Parent Skills

**Brainstorming SKILL.md** — add after Phase 4 (VALIDATE), step 1 (section-by-section presentation), before step 2 (write spec):

```
After all sections are reviewed and the spec is drafted, invoke
harness-soundness-review --mode spec against the draft.
Do not proceed to write the spec to docs/ until the soundness
review converges with no remaining issues.
```

**Planning SKILL.md** — add after Phase 4 (VALIDATE), after completeness verification, before writing the plan:

```
After the plan passes completeness verification, invoke
harness-soundness-review --mode plan against the draft.
Do not proceed to write the plan until the soundness
review converges with no remaining issues.
```

## Success Criteria

1. **Automatic invocation** — soundness review runs without any user command; it's part of the brainstorming and planning flows
2. **Spec coherence caught** — contradictions between decisions, design, and success criteria are detected before sign-off
3. **Traceability enforced** — every goal maps to criteria (spec mode); every criterion maps to tasks (plan mode)
4. **Silent fixes don't require user attention** — inferrable fixes (missing traceability links, obvious error cases, dependency edges) are applied and logged without prompting
5. **Design decisions always surface** — contradictions, feasibility concerns, YAGNI violations, and scope drift are never auto-fixed; user always decides
6. **Convergence terminates** — the loop stops when issue count stops decreasing; no infinite loops
7. **Works without graph** — all checks produce useful results from document analysis + codebase reads alone
8. **Graph enhances when available** — feasibility and dependency checks are more precise with graph queries
9. **No new user commands** — users invoke brainstorming and planning exactly as before; soundness review is invisible until it surfaces an issue
10. **Parent skills unmodified except for one invocation line each** — brainstorming and planning SKILL.md files gain minimal additions

## Implementation Order

1. **Skill scaffold** — Create `harness-soundness-review` skill with `skill.yaml` and `SKILL.md`. Define the two modes, finding schema, and convergence loop structure. No checks yet — just the skeleton.

2. **Spec mode checks** — Implement the 7 spec checks (S1–S7). Start with the checks that are purely document analysis (S1 coherence, S2 traceability, S6 YAGNI, S7 testability), then add codebase-aware checks (S3 assumptions, S4 completeness, S5 feasibility).

3. **Auto-fix + convergence loop** — Implement the fix/re-check/converge pattern for spec mode. Define which fixes are silent vs surfaced. Test the loop termination logic.

4. **Plan mode checks** — Implement the 7 plan checks (P1–P7). Start with document-only checks (P1 coverage, P2 completeness, P6 scope drift), then add structural checks (P3 dependencies, P4 ordering, P5 risk coverage, P7 feasibility).

5. **Auto-fix for plan mode** — Extend the convergence loop for plan-specific auto-fixes (adding tasks, reordering, adding dependency edges).

6. **Graph integration** — Add graph-enhanced paths for feasibility (S5), assumptions (S3), coverage (P1), dependencies (P3), and ordering (P4). Implement fallback behavior.

7. **Parent skill integration** — Add the invocation line to brainstorming SKILL.md and planning SKILL.md. Verify the handoff between parent skill and soundness review preserves context.

8. **User escalation UX** — Refine how unfixable issues are presented: what's wrong, why it matters, resolution options. Ensure the loop resumes cleanly after user resolution.
