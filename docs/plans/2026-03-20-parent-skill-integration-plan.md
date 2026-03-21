# Plan: Parent Skill Integration (Soundness Review Phase 7)

**Date:** 2026-03-21
**Spec:** docs/changes/spec-plan-soundness-review/proposal.md
**Estimated tasks:** 2
**Estimated time:** 6 minutes

## Goal

Add soundness review invocation lines to harness-brainstorming and harness-planning SKILL.md files so that soundness review runs automatically before spec/plan sign-off.

## Observable Truths (Acceptance Criteria)

1. When harness-brainstorming reaches Phase 4, step 1 completion, the SKILL.md instructs the agent to invoke `harness-soundness-review --mode spec` before writing the spec to `docs/`.
2. When harness-planning reaches Phase 4, after completeness verification, the SKILL.md instructs the agent to invoke `harness-soundness-review --mode plan` before writing the plan.
3. The gemini-cli copies of both skills remain byte-identical to their claude-code counterparts (both are symlinks, so editing the claude-code source automatically updates gemini-cli).
4. `harness validate` passes after both edits.
5. The skill structure tests pass (`cd packages/cli && pnpm exec vitest run tests/skills`).

## File Map

- MODIFY `agents/skills/claude-code/harness-brainstorming/SKILL.md` (add soundness review invocation block between step 1 and step 2 in Phase 4)
- MODIFY `agents/skills/claude-code/harness-planning/SKILL.md` (add soundness review invocation block between step 5 and step 6 in Phase 4)

Note: `agents/skills/gemini-cli/harness-brainstorming` and `agents/skills/gemini-cli/harness-planning` are **symlinks** to their claude-code counterparts. No separate file edits needed. Platform parity is automatic.

## Tasks

### Task 1: Add soundness review invocation to brainstorming SKILL.md

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-brainstorming/SKILL.md`

1. Open `agents/skills/claude-code/harness-brainstorming/SKILL.md`

2. Locate Phase 4: VALIDATE, step 1 (lines 80-85, "Present the design section by section") and step 2 (lines 87-89, "After all sections are reviewed, write the spec").

3. Insert the following block between step 1 and step 2 (after line 86, before line 87). The new text becomes a new numbered step, and the old step 2 becomes step 3, old step 3 becomes step 4, old step 4 becomes step 5:

   Replace the existing steps 1-4:

   ```markdown
   1. **Present the design section by section.** Do not dump the entire spec at once. Present each major section, get feedback, and incorporate it before moving to the next:
      - Overview and goals
      - Decisions made (with rationale from the brainstorming conversation)
      - Technical design (data structures, APIs, file layout)
      - Success criteria (observable, testable outcomes)
      - Implementation order (high-level phases, not detailed tasks — that is harness-planning's job)

   2. **After all sections are reviewed, write the spec to `docs/`.** Use the project's existing spec naming convention. If none exists, use `docs/changes/<feature-name>/proposal.md`.

      When the project has `docs/changes/`, write proposals to `docs/changes/<feature>/proposal.md` instead. This keeps change proposals separate from established specs. Fall back to the existing behavior (`docs/changes/`) when no `docs/changes/` directory exists yet.

   3. **Run `harness validate`** to verify the spec file is properly placed and the project remains healthy.

   4. **Ask for final sign-off.** Present the complete spec file path and a one-paragraph summary. The human must explicitly approve before this skill is complete.
   ```

   With the updated steps (inserting new step 2, renumbering old 2-4 to 3-5):

   ```markdown
   1. **Present the design section by section.** Do not dump the entire spec at once. Present each major section, get feedback, and incorporate it before moving to the next:
      - Overview and goals
      - Decisions made (with rationale from the brainstorming conversation)
      - Technical design (data structures, APIs, file layout)
      - Success criteria (observable, testable outcomes)
      - Implementation order (high-level phases, not detailed tasks — that is harness-planning's job)

   2. **Run soundness review.** After all sections are reviewed and the spec is drafted, invoke `harness-soundness-review --mode spec` against the draft. Do not proceed to write the spec to `docs/` until the soundness review converges with no remaining issues.

   3. **After all sections are reviewed, write the spec to `docs/`.** Use the project's existing spec naming convention. If none exists, use `docs/changes/<feature-name>/proposal.md`.

      When the project has `docs/changes/`, write proposals to `docs/changes/<feature>/proposal.md` instead. This keeps change proposals separate from established specs. Fall back to the existing behavior (`docs/changes/`) when no `docs/changes/` directory exists yet.

   4. **Run `harness validate`** to verify the spec file is properly placed and the project remains healthy.

   5. **Ask for final sign-off.** Present the complete spec file path and a one-paragraph summary. The human must explicitly approve before this skill is complete.
   ```

4. Verify the symlink is intact:

   ```
   ls -la agents/skills/gemini-cli/harness-brainstorming
   diff agents/skills/claude-code/harness-brainstorming/SKILL.md agents/skills/gemini-cli/harness-brainstorming/SKILL.md
   ```

   Expect: symlink, no diff.

5. Run: `harness validate`

6. Do NOT commit yet — wait for Task 2 so both files can be committed together.

### Task 2: Add soundness review invocation to planning SKILL.md

**Depends on:** Task 1 (both changes committed together)
**Files:** `agents/skills/claude-code/harness-planning/SKILL.md`

1. Open `agents/skills/claude-code/harness-planning/SKILL.md`

2. Locate Phase 4: VALIDATE. The current steps are:
   - Step 1: Verify completeness (line 121)
   - Step 2: Verify task sizing (line 123)
   - Step 3: Verify TDD compliance (line 125)
   - Step 4: Run `harness validate` (line 127-128)
   - Step 5: Check failures log (line 129-130)
   - Step 6: Write the plan to `docs/plans/` (line 131-132)
   - Step 7: Write handoff (line 133-147)
   - Step 8: Present the plan (line 148-149)

3. Insert a new step between step 5 (check failures log) and step 6 (write the plan). The new text becomes step 6, and old steps 6-8 become steps 7-9.

   Replace the existing step 5 through step 6 boundary:

   ```markdown
   5. **Check failures log.** Read `.harness/failures.md` before finalizing. If planned approaches match known failures, flag them with warnings.

   6. **Write the plan to `docs/plans/`.** Use naming convention: `YYYY-MM-DD-<feature-name>-plan.md`. If the directory does not exist, create it.
   ```

   With:

   ```markdown
   5. **Check failures log.** Read `.harness/failures.md` before finalizing. If planned approaches match known failures, flag them with warnings.

   6. **Run soundness review.** After the plan passes completeness verification, invoke `harness-soundness-review --mode plan` against the draft. Do not proceed to write the plan until the soundness review converges with no remaining issues.

   7. **Write the plan to `docs/plans/`.** Use naming convention: `YYYY-MM-DD-<feature-name>-plan.md`. If the directory does not exist, create it.
   ```

   Also renumber old step 7 (write handoff) to step 8, and old step 8 (present to human) to step 9.

4. Verify the symlink is intact:

   ```
   ls -la agents/skills/gemini-cli/harness-planning
   diff agents/skills/claude-code/harness-planning/SKILL.md agents/skills/gemini-cli/harness-planning/SKILL.md
   ```

   Expect: symlink, no diff.

5. Run: `harness validate`

6. Run skill tests: `cd packages/cli && pnpm exec vitest run tests/skills`

7. Commit both files together:

   ```
   git add agents/skills/claude-code/harness-brainstorming/SKILL.md agents/skills/claude-code/harness-planning/SKILL.md
   git commit -m "feat(soundness-review): add soundness review invocation to brainstorming and planning skills"
   ```

   Staging only the claude-code sources is correct because the gemini-cli paths are symlinks — git follows the symlinks and tracks the same content.
