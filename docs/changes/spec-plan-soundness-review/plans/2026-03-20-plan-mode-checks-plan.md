# Plan: Plan Mode Checks (P1-P7)

**Date:** 2026-03-20
**Spec:** docs/changes/spec-plan-soundness-review/proposal.md
**Phase:** 4 of 8 (Plan mode checks)
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Replace the "Not yet implemented" stub in the SKILL.md plan-mode check table with detailed, actionable check procedures for all seven plan checks (P1-P7) so that an agent running the soundness review in `--mode plan` knows exactly what to analyze, how to classify findings, and when findings are auto-fixable.

## Observable Truths (Acceptance Criteria)

1. The SKILL.md's Plan Mode Checks section contains a detailed subsection for each of P1 through P7 (7 subsections total), each using `#####` heading level (matching spec-mode check subsections).
2. The `> **Status:** Not yet implemented. Check stubs will be added in Phase 4 of the implementation order.` note is removed from the plan mode checks section.
3. Each check subsection contains: (a) a "What to analyze" description, (b) a "How to detect" procedure, (c) a "Finding classification" block specifying severity and auto-fixable status, and (d) one or more "Example finding(s)" in the SoundnessFinding JSON schema.
4. Check P1 has findings marked `autoFixable: true` (missing tasks for uncovered criteria).
5. Check P2 has findings marked `autoFixable: true` (infer missing inputs/outputs/verification from context).
6. Check P3 has findings marked `autoFixable: true` (add missing dependency edges, detect cycles).
7. Check P4 has findings marked `autoFixable: true` (reorder tasks touching same files or with producer-consumer violations).
8. Check P5 has findings marked `autoFixable: true` for obvious risk mitigation and `autoFixable: false` for judgment calls.
9. Checks P6 and P7 have all findings marked `autoFixable: false` (surface to user).
10. Codebase-aware checks (P1, P3, P4) include both "without graph" and "with graph" procedure variants (matching the Codebase & Graph Integration table in the spec).
11. Document-only checks (P2, P5, P6, P7) do NOT reference graph queries.
12. The plan-mode example invocation in the Examples section is updated to show realistic check output instead of `[not yet implemented]` stubs.
13. The claude-code and gemini-cli copies of SKILL.md remain byte-identical after all changes.
14. `harness validate` passes after all changes.
15. The Phase 2 FIX procedures section is extended with plan-mode fix procedures (P1, P2, P3, P4, P5) following the same format as the existing S2/S3/S4/S7 fix procedures.

## File Map

```
MODIFY agents/skills/claude-code/harness-soundness-review/SKILL.md
COPY   agents/skills/gemini-cli/harness-soundness-review/SKILL.md (byte-identical copy)
```

Only two files are touched. All changes are documentation (SKILL.md procedure text), not runtime code.

## Tasks

### Task 1: Add P1 (Spec-Plan Coverage) and P2 (Task Completeness) check procedures

**Depends on:** none
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Replace the stub note with the first two plan-mode check procedure subsections.

1. Read the current SKILL.md to confirm exact line positions of the plan-mode check table and stub note.

2. Remove the line:

   ```
   > **Status:** Not yet implemented. Check stubs will be added in Phase 4 of the implementation order.
   ```

3. In its place (between the P7 table row and the `---` separator before Phase 2), add:

   **##### P1 Spec-Plan Coverage**
   - **What to analyze:** The spec's Success Criteria section and the plan's Tasks section. Requires access to both the spec document (referenced in the plan header) and the plan being reviewed.
   - **How to detect:**
     - Without graph: Extract each numbered success criterion from the spec. For each criterion, search the plan's task descriptions, verification steps, and observable truths for text that covers the criterion. A criterion is "covered" if at least one task's verification step or observable truth would confirm the criterion is met. Flag any criterion with no corresponding task coverage.
     - With graph: If graph traceability edges exist between spec criteria and plan tasks, use those edges to verify coverage. Flag criteria with no inbound traceability edge.
   - **Finding classification:** Always `severity: "error"`, always `autoFixable: true`. The fix is to add a new task (or extend an existing task's verification step) that covers the uncovered criterion.
   - **Example finding:** A JSON block showing spec criterion #4 has no corresponding plan task.

   **##### P2 Task Completeness**
   - **What to analyze:** Each task in the plan's Tasks section.
   - **How to detect:** For each task, verify it has: (a) clear inputs (what files/artifacts the task reads or depends on), (b) clear outputs (what files the task creates or modifies), (c) a verification criterion (a test command, observable behavior, or check that confirms the task succeeded). Flag tasks missing any of these three elements.
   - **Finding classification:** Always `severity: "warning"`, always `autoFixable: true`. The fix is to infer the missing element from the task description and surrounding context (e.g., if a task says "create src/foo.ts" but has no verification, add "Run: `npx vitest run src/foo.test.ts`" if a test file exists in the plan, or "Run: `tsc --noEmit`" as a minimal verification).
   - **Example finding:** A JSON block showing Task 3 has no verification criterion.

4. Run: `harness validate`
5. Commit: `feat(soundness-review): add P1 coverage and P2 completeness check procedures`

---

### Task 2: Add P3 (Dependency Correctness) check procedure

**Depends on:** Task 1
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Add the P3 check procedure subsection after P2. This is a codebase-aware check with graph integration.

1. After the P2 subsection, add:

   **##### P3 Dependency Correctness**
   - **What to analyze:** The "Depends on" declarations across all tasks, and the file paths / artifacts referenced in each task.
   - **How to detect:**
     - Build a dependency graph from all "Depends on: Task N" declarations.
     - **Cycle detection:** Run a topological sort on the graph. If the sort fails, a cycle exists. Report the cycle as the set of tasks involved (e.g., "Task 3 -> Task 5 -> Task 3").
     - **Missing edges:** For each task, extract the files it reads or imports. If a file is created by another task (check the File Map), verify the creating task is declared as a dependency. Flag missing edges.
     - Without graph (static analysis): Parse file paths from task descriptions ("Create src/types/foo.ts", "Modify src/services/bar.ts") and match creators to consumers.
     - With graph: Use `get_impact` on each task's output files to verify that all downstream consumers are declared as dependents. Graph edges provide more accurate dependency data than text parsing.
   - **Finding classification:**
     - Cycles: `severity: "error"`, `autoFixable: false`. Cycles indicate a decomposition error that requires restructuring tasks. Surface to user.
     - Missing dependency edges: `severity: "warning"`, `autoFixable: true`. The fix is to add the missing "Depends on" declaration to the consuming task.
   - **Example findings:** One showing a cycle (non-auto-fixable), one showing a missing dependency edge (auto-fixable).

2. Run: `harness validate`
3. Commit: `feat(soundness-review): add P3 dependency correctness check procedure`

---

### Task 3: Add P4 (Ordering Sanity) check procedure

**Depends on:** Task 2
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Add the P4 check procedure subsection after P3. This is a codebase-aware check with graph integration.

1. After the P3 subsection, add:

   **##### P4 Ordering Sanity**
   - **What to analyze:** The task execution order (numbering and dependency graph), the file paths each task touches, and any parallel opportunities declared.
   - **How to detect:**
     - **File conflict detection:** Extract file paths from each task. If two tasks touch the same file and are not sequenced by a dependency edge (one could run before the other), flag them as a potential conflict. Tasks touching the same file must be ordered.
     - **Consumer-before-producer:** If Task A creates a type or export that Task B imports, but Task B has a lower number and no dependency on Task A, the consumer is scheduled before the producer. Flag the ordering violation.
     - Without graph: Parse file paths from task descriptions and the File Map. Build a file-to-task mapping and check for conflicts.
     - With graph: Use graph file ownership data to get accurate file-to-module mappings. This catches indirect conflicts (e.g., two tasks modify different files in the same module, and the module has a single barrel export that both affect).
   - **Finding classification:** Always `severity: "warning"`, always `autoFixable: true`. The fix is to reorder the tasks (update task numbers and "Depends on" declarations) so that producers come before consumers and file-conflicting tasks are sequenced.
   - **Example finding:** A JSON block showing Task 4 creates `src/types/user.ts` but Task 2 imports from it and has no dependency on Task 4.

2. Run: `harness validate`
3. Commit: `feat(soundness-review): add P4 ordering sanity check procedure`

---

### Task 4: Add P5 (Risk Coverage) and P6 (Scope Drift) check procedures

**Depends on:** Task 3
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Add P5 and P6 check procedure subsections after P4. Both are document-only checks.

1. After the P4 subsection, add:

   **##### P5 Risk Coverage**
   - **What to analyze:** The spec's risk-related content (any section mentioning risks, caveats, concerns, open questions) and the plan's tasks and checkpoints.
   - **How to detect:** Identify risks stated in the spec. These appear in: explicit "Risks" sections, decision rationale mentioning tradeoffs, success criteria that imply failure modes, non-goals that have adjacent risk (e.g., "not in CI" implies no automated gate). For each identified risk, check whether the plan contains: (a) a task that directly mitigates it, (b) a checkpoint that acknowledges it, or (c) an explicit "accepted risk" note. Flag risks with no coverage.
   - **Finding classification:**
     - Obvious mitigation (the risk is technical and a straightforward task addresses it, e.g., "add error handling for X"): `severity: "warning"`, `autoFixable: true`. The fix is to add a mitigation task or extend an existing task's verification step.
     - Judgment-dependent mitigation (the risk involves a design tradeoff, e.g., "performance vs correctness" or "scope vs timeline"): `severity: "warning"`, `autoFixable: false`. Surface to user with mitigation options.
   - **Example findings:** One showing an auto-fixable missing mitigation task, one showing a judgment call surfaced to user.

   **##### P6 Scope Drift**
   - **What to analyze:** The plan's tasks and the spec's goals, success criteria, and technical design.
   - **How to detect:** For each plan task, check whether it is traceable to a spec requirement. A task is traceable if it (a) directly implements a success criterion, (b) is a necessary prerequisite for a task that implements a criterion (type definitions, shared utilities), or (c) is infrastructure work explicitly called for in the spec's implementation order. Flag tasks that cannot be traced to any spec requirement.
   - **Finding classification:** Always `severity: "warning"`, always `autoFixable: false`. Untraceable tasks might be intentional prerequisite work that the planner identified as necessary. The user must confirm whether each flagged task is in scope or should be removed.
   - **Example finding:** A JSON block showing Task 8 adds a caching layer not mentioned anywhere in the spec.

2. Run: `harness validate`
3. Commit: `feat(soundness-review): add P5 risk coverage and P6 scope drift check procedures`

---

### Task 5: Add P7 (Task-Level Feasibility) check procedure

**Depends on:** Task 4
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Add the P7 check procedure subsection after P6.

1. After the P6 subsection, add:

   **##### P7 Task-Level Feasibility**
   - **What to analyze:** Each task's description, file paths, code snippets, and referenced decisions.
   - **How to detect:**
     - **Undecided dependencies:** Check whether any task requires a design decision that was not made during brainstorming. Indicators: task description says "depending on the approach chosen", "if we go with option A", or references a decision not present in the spec's Decisions table.
     - **Vague instructions:** Check whether any task lacks the specificity required by the harness-planning iron law ("every task must be completable in one context window"). Indicators: task says "implement the service" without specifying which functions, "add validation" without specifying what validation rules, or "handle errors" without specifying which errors and how.
     - **Oversized tasks:** Check whether any task touches more than 3 files, or combines multiple independent concerns (e.g., "create the type, implement the service, write tests, and integrate with the API" in a single task).
   - **Finding classification:** Always `severity: "error"`, always `autoFixable: false`. Feasibility problems require the planner to revise the task — either by making a decision, splitting the task, or adding specificity. These are judgment calls that an auto-fix cannot resolve correctly.
   - **Example findings:** One showing a task that depends on an unmade decision, one showing a task too vague to execute.

2. Run: `harness validate`
3. Commit: `feat(soundness-review): add P7 task-level feasibility check procedure`

---

### Task 6: Add plan-mode fix procedures and update Phase 2 FIX section

**Depends on:** Task 5
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Extend the Phase 2 FIX section with plan-mode fix procedures and the Silent vs Surfaced classification table, mirroring how spec-mode has S2/S3/S4/S7 fix procedures.

1. After the existing S4 Fix procedure (and before the Fix Log Format section), add fix procedures for auto-fixable plan checks:

   **##### P1 Fix: Add Missing Tasks for Uncovered Criteria**
   - When: A spec success criterion has no corresponding plan task.
   - Procedure: (1) Read the spec criterion and Technical Design for context. (2) Draft a new task that would verify the criterion, including file paths, test commands, and commit message. (3) Insert the task at the appropriate position in the task list (respecting dependencies). (4) Update the File Map if new files are introduced. (5) Record a fix log entry.
   - Edit operation: Insert new task in Tasks section; update File Map.
   - Fix log entry example.

   **##### P2 Fix: Fill In Missing Task Elements**
   - When: A task is missing clear inputs, outputs, or verification criteria.
   - Procedure: (1) Identify which element is missing (inputs, outputs, or verification). (2) Infer from the task description and surrounding tasks. (3) Add the missing element to the task. (4) Record a fix log entry.
   - Edit operation: Modify the task in place.
   - Fix log entry example.

   **##### P3 Fix: Add Missing Dependency Edges**
   - When: Task B uses a file or artifact produced by Task A but does not declare "Depends on: Task A".
   - Procedure: (1) Identify the producer task from the File Map. (2) Add "Depends on: Task N" to the consuming task's header. (3) Record a fix log entry.
   - Edit operation: Modify the consuming task's "Depends on" line.
   - Fix log entry example.

   **##### P4 Fix: Reorder Conflicting Tasks**
   - When: Two tasks touch the same file but are not sequenced, or a consumer task is numbered before its producer.
   - Procedure: (1) Identify the conflict. (2) Reorder by updating task numbers or adding a dependency edge. (3) If reordering changes task numbers, update all "Depends on" references throughout the plan. (4) Record a fix log entry.
   - Edit operation: Reorder tasks and update cross-references.
   - Fix log entry example.

   **##### P5 Fix: Add Obvious Mitigation Tasks**
   - When: A spec risk has no coverage in the plan and the mitigation is straightforward (e.g., add error handling, add a test for an edge case).
   - Procedure: (1) Read the risk description from the spec. (2) Draft a mitigation task or extend an existing task's verification step. (3) Insert at the appropriate position. (4) Record a fix log entry.
   - Edit operation: Insert new task or extend existing task; update File Map if needed.
   - Fix log entry example.

2. Extend the Silent vs Surfaced Classification table to include P1-P7 entries:

   | P1 | Missing task for uncovered criterion | Silent fix |
   | P2 | Missing inputs, outputs, or verification | Silent fix |
   | P3 | Missing dependency edges | Silent fix |
   | P3 | Dependency cycles | Surfaced -- restructuring is a design decision |
   | P4 | File conflicts or consumer-before-producer | Silent fix |
   | P5 | Obvious risk mitigation (technical, straightforward) | Silent fix |
   | P5 | Judgment-dependent risk mitigation | Surfaced -- user must choose strategy |
   | P6 | None -- all findings need user input | Always surfaced |
   | P7 | None -- all findings need user input | Always surfaced |

3. Run: `harness validate`
4. Commit: `feat(soundness-review): add plan-mode fix procedures (P1-P5) and classification table`

---

### Task 7: Update plan-mode example, copy to gemini-cli, final validation

**Depends on:** Task 6
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md, agents/skills/gemini-cli/harness-soundness-review/SKILL.md

[checkpoint:human-verify] -- verify the plan-mode check procedures look correct before final copy.

1. In the Examples section, replace the "Plan Mode Invocation (Skeleton)" example. Replace the `[not yet implemented]` stubs with realistic check output that demonstrates findings, auto-fixes, convergence, and surfacing. Pattern it after the spec-mode example but with plan-specific checks. Example:

   ```
   Invoking harness-soundness-review --mode plan...

   Phase 1: CHECK
     Running P1 (spec-plan coverage)... 1 finding (auto-fixable)
     Running P2 (task completeness)... 2 findings (auto-fixable)
     Running P3 (dependency correctness)... 1 finding (auto-fixable)
     Running P4 (ordering sanity)... 0 findings
     Running P5 (risk coverage)... 1 finding (1 needs user input)
     Running P6 (scope drift)... 0 findings
     Running P7 (task-level feasibility)... 1 finding (needs user input)

     6 findings total: 4 auto-fixable, 2 need user input.

   Phase 2: FIX
     [P1-001] FIXED: Added Task 9 covering spec criterion #5 (error logging).
     [P2-001] FIXED: Added verification step to Task 3 (run vitest).
     [P2-002] FIXED: Added outputs to Task 6 (creates src/utils/helper.ts).
     [P3-001] FIXED: Added 'Depends on: Task 2' to Task 5 (uses types from Task 2).
     4 auto-fixes applied.

   Phase 3: CONVERGE
     Re-running checks...
     Issue count: 2 (was 6). Decreased -- continuing.
     Re-running checks...
     Issue count: 2 (unchanged). Converged.

   Phase 4: SURFACE
     2 remaining issues need your input:

     [P5-001] Spec risk 'convergence loop may not terminate' has no mitigation (warning)
     The spec identifies loop termination as a risk, but no plan task tests
     termination behavior.
     -> Add a test task for convergence termination, or accept the risk explicitly.

     [P7-001] Task 7 depends on undecided caching strategy (error)
     Task 7 says 'implement caching layer' but the spec Decisions table has no
     entry for caching strategy. This task cannot be executed without a decision.
     -> Make the caching decision in the spec, then update Task 7 with specifics.

     User resolves P5-001 -> adds Task 10 for termination test.
     User resolves P7-001 -> updates spec with LRU cache decision, updates Task 7.
     Re-running checks... 0 findings.

   CLEAN EXIT -- returning control to harness-planning for sign-off.
   ```

2. Copy the claude-code SKILL.md to gemini-cli:

   ```
   cp agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

3. Run: `diff agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md` -- verify no diff.

4. Run: `harness validate`

5. Commit: `feat(soundness-review): update plan-mode example and sync gemini-cli copy`

## Traceability Matrix

| Observable Truth                                           | Delivered by Task(s) |
| ---------------------------------------------------------- | -------------------- |
| 1. Seven P1-P7 subsections exist                           | Tasks 1-5            |
| 2. Stub note removed                                       | Task 1               |
| 3. Four-part template (analyze, detect, classify, example) | Tasks 1-5            |
| 4. P1 auto-fixable                                         | Task 1               |
| 5. P2 auto-fixable                                         | Task 1               |
| 6. P3 auto-fixable + non-auto-fixable (cycles)             | Task 2               |
| 7. P4 auto-fixable                                         | Task 3               |
| 8. P5 partially auto-fixable                               | Task 4               |
| 9. P6 and P7 non-auto-fixable                              | Tasks 4, 5           |
| 10. Graph variants for P1, P3, P4                          | Tasks 1, 2, 3        |
| 11. No graph refs in P2, P5, P6, P7                        | Tasks 1, 4, 5        |
| 12. Plan-mode example updated                              | Task 7               |
| 13. Byte-identical copies                                  | Task 7               |
| 14. harness validate passes                                | All tasks            |
| 15. Plan-mode fix procedures in Phase 2 FIX                | Task 6               |
