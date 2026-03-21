# Plan: Plan-Mode Auto-Fix for Convergence Loop

**Date:** 2026-03-20
**Spec:** docs/changes/spec-plan-soundness-review/proposal.md (Phase 5)
**Estimated tasks:** 3
**Estimated time:** 10 minutes

## Goal

The Phase 3 CONVERGE section of the harness-soundness-review SKILL.md includes plan-mode cascading fix examples and a plan-mode worked example, so that the convergence loop documentation covers both modes with equal depth.

## Observable Truths (Acceptance Criteria)

1. The "Cascading Fixes" subsection (currently at ~line 888) contains at least 3 plan-mode cascading fix examples alongside the existing 3 spec-mode examples.
2. A "Worked Example: Plan-Mode Two-Pass Convergence" subsection exists in Phase 3 CONVERGE, showing a multi-pass convergence scenario using P1-P7 checks with at least one cascading fix.
3. The plan-mode worked example arithmetic is consistent (finding counts match between narrative and totals, decrease checks are correct).
4. The gemini-cli copy at `agents/skills/gemini-cli/harness-soundness-review/SKILL.md` is byte-identical to the claude-code copy.
5. `harness validate` passes after all changes.
6. The skill test suite passes (structure, schema, platform-parity, references).

## File Map

- MODIFY `agents/skills/claude-code/harness-soundness-review/SKILL.md` (add plan-mode cascading fixes and worked example to Phase 3 CONVERGE)
- MODIFY `agents/skills/gemini-cli/harness-soundness-review/SKILL.md` (copy of claude-code version)

## Tasks

### Task 1: Add plan-mode cascading fix examples to Phase 3 CONVERGE

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-soundness-review/SKILL.md`

1. Read the current Cascading Fixes subsection (lines 888-896). It currently contains only spec-mode examples:
   - S4 enables S3 (error case fix creates Assumptions section)
   - S2 enables S7 (new criterion can be sharpened)
   - S4 enables S4 (first error case establishes local convention)

2. After the existing spec-mode cascading fix examples (after line 896, before the "Cascading fixes are the reason..." sentence), insert the following plan-mode cascading fix examples:

   ```markdown
   Plan-mode cascading fix examples:

   - **P1 enables P3:** The P1 fix adds a new task (covering a missing spec criterion). In the next pass, P3 detects that existing tasks import files created by the new task but do not declare a dependency on it. P3 adds the missing dependency edges.
   - **P1 enables P4:** The P1 fix adds a new task that creates a type file. In the next pass, P4 detects that the new task should be ordered before tasks that import that type, and reorders accordingly.
   - **P2 enables P5:** The P2 fix adds a verification step to a task, making its outputs explicit. In the next pass, P5 finds that a spec risk (previously unmatched to any task) is now mitigated by the newly explicit verification step.
   ```

3. Verify the "Cascading fixes are the reason..." closing sentence still follows naturally after both the spec-mode and plan-mode examples.

4. Run: `pnpm exec harness validate`

5. Commit: `feat(soundness-review): add plan-mode cascading fix examples to convergence loop`

### Task 2: Add plan-mode worked example to Phase 3 CONVERGE

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-soundness-review/SKILL.md`

1. Read the current "Worked Example: Two-Pass Convergence" subsection (lines 898-947). It is spec-mode only.

2. After the spec-mode worked example (after line 947, before the "#### Termination Guarantee" heading), insert a new plan-mode worked example:

   ```markdown
   #### Worked Example: Plan-Mode Two-Pass Convergence
   ```

   Pass 1 (initial check):
   P1: 1 finding (auto-fixable: spec criterion #6 has no plan task)
   P2: 1 finding (auto-fixable: Task 4 missing verification step)
   P3: 0 findings
   P4: 0 findings
   P5: 1 finding (needs user input: performance vs correctness tradeoff)
   P6: 0 findings
   P7: 1 finding (needs user input: Task 7 depends on undecided caching strategy)
   Total: 4 findings, 2 auto-fixable, 2 need user input.
   → count_previous = 4

   Phase 2 (FIX): Apply 2 auto-fixes.
   [P1-001] FIXED: Added Task 9 covering spec criterion #6 (structured error logging).
   Creates src/utils/error-logger.ts and src/utils/error-logger.test.ts.
   [P2-001] FIXED: Added verification step to Task 4:
   'Run: npx vitest run src/services/notification-service.test.ts'

   Pass 2 (re-check):
   P1: 0 findings (criterion now covered by Task 9)
   P2: 0 findings (Task 4 now has verification)
   P3: 1 finding — CASCADING: Task 9 (added by P1-001) creates
   src/utils/error-logger.ts, but Task 6 imports from it without
   declaring 'Depends on: Task 9'. (1 auto-fixable)
   P4: 0 findings
   P5: 1 finding (unchanged: performance tradeoff still needs user input)
   P6: 0 findings
   P7: 1 finding (unchanged: caching decision still needed)
   Total: 3 findings, 1 auto-fixable, 2 need user input.
   → count_current = 3 < count_previous = 4. Progress made. Continue.

   Phase 2 (FIX): Apply 1 auto-fix.
   [P3-001] FIXED: Added 'Depends on: Task 9' to Task 6.

   Pass 3 (re-check):
   P5: 1 finding (unchanged: performance tradeoff)
   P7: 1 finding (unchanged: caching decision)
   Total: 2 findings, 0 auto-fixable, 2 need user input.
   → count_current = 2 < count_previous = 3. Progress made. Continue.

   Phase 2 (FIX): 0 auto-fixable findings. Nothing to fix.

   Pass 4 (re-check):
   Total: 2 findings, 0 auto-fixable.
   → count_current = 2 = count_previous = 2. No progress. Converged.
   → Proceed to Phase 4 (SURFACE) with 2 remaining issues.

   ```

   ```

3. Verify arithmetic consistency:
   - Pass 1: 4 total = 1 (P1) + 1 (P2) + 1 (P5) + 1 (P7). Correct.
   - Pass 2: 3 total = 1 (P3 cascading) + 1 (P5) + 1 (P7). Correct. 3 < 4. Correct.
   - Pass 3: 2 total = 1 (P5) + 1 (P7). Correct. 2 < 3. Correct.
   - Pass 4: 2 total. 2 = 2. Correct. Converged.

4. Verify the cascading fix (P1 enables P3) matches one of the cascading fix examples added in Task 1.

5. Run: `pnpm exec harness validate`

6. Commit: `feat(soundness-review): add plan-mode worked example to convergence loop`

### Task 3: Copy to gemini-cli and final validation

[checkpoint:human-verify]
**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-soundness-review/SKILL.md`, `agents/skills/gemini-cli/harness-soundness-review/SKILL.md`

1. Read the final claude-code SKILL.md to verify:
   - Plan-mode cascading fix examples appear in the Cascading Fixes subsection
   - Plan-mode worked example appears between the spec-mode worked example and the Termination Guarantee section
   - Arithmetic in the worked example is consistent
   - The "P1 enables P3" cascading fix in the worked example matches the "P1 enables P3" example in the cascading fixes list

2. Copy the claude-code SKILL.md to gemini-cli:

   ```
   cp agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

3. Run: `pnpm exec harness validate`

4. Run the skill test suite:

   ```
   cd packages/cli && pnpm exec vitest run tests/skills
   ```

5. Verify both copies are byte-identical:

   ```
   diff agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

6. Stage both files together (honoring Prettier parity learning):

   ```
   git add agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

7. Commit: `feat(soundness-review): plan-mode auto-fix convergence with gemini-cli parity`

## Traceability

| Observable Truth                                       | Delivered by                     |
| ------------------------------------------------------ | -------------------------------- |
| 1. Plan-mode cascading fix examples in Cascading Fixes | Task 1                           |
| 2. Plan-mode worked example in Phase 3 CONVERGE        | Task 2                           |
| 3. Arithmetic consistency                              | Task 2 (step 3), Task 3 (step 1) |
| 4. Gemini-cli byte-identical                           | Task 3                           |
| 5. harness validate passes                             | Tasks 1, 2, 3                    |
| 6. Skill test suite passes                             | Task 3                           |
