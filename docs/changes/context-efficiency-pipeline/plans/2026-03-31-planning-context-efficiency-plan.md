# Plan: Planning Context Efficiency -- Skill Integration (Phase 3)

**Date:** 2026-03-31
**Spec:** docs/changes/context-efficiency-pipeline/proposal.md
**Phase:** 3 of 5 (Skill Integration -- Planning)
**Estimated tasks:** 5
**Estimated time:** 18 minutes

## Goal

The planning SKILL.md and skill.yaml instruct agents to parse `--fast`/`--thorough` rigor flags and use a two-pass skeleton-then-expansion workflow, with gating logic that varies by rigor level -- so that directional errors are caught early before full task expansion consumes tokens.

## Observable Truths (Acceptance Criteria)

1. When `--fast` is passed to planning (via autopilot's `rigorLevel: fast`), the SKILL.md instructs the planner to skip the skeleton pass and produce the full plan directly.
2. When `--thorough` is passed, the SKILL.md instructs the planner to always produce a skeleton and require human approval before expanding to full tasks.
3. When `--standard` applies and the estimated task count is >= 8, a skeleton is presented for approval before full expansion.
4. When `--standard` applies and the estimated task count is < 8, the full plan is generated directly (no skeleton).
5. The `skill.yaml` file declares `--fast` and `--thorough` as CLI arguments.
6. A "Rigor Levels" section exists in SKILL.md defining behavior for all three levels across SCOPE, DECOMPOSE, SEQUENCE, and VALIDATE phases.
7. A skeleton generation step exists within Phase 2 (DECOMPOSE), between the file map and task decomposition, describing the skeleton format, approval gate, and expansion workflow.
8. The skeleton format is lightweight (~200 tokens): numbered phases with task count estimates.
9. The Plan Document Structure template includes an optional `## Skeleton` section.
10. Success Criteria section includes rigor-level and skeleton-related criteria.
11. `harness validate` passes after all changes.

## File Map

- MODIFY `agents/skills/claude-code/harness-planning/skill.yaml` (add --fast/--thorough args)
- MODIFY `agents/skills/claude-code/harness-planning/SKILL.md` (rigor levels section, two-pass skeleton in DECOMPOSE, plan document structure, success criteria, examples)

## Tasks

### Task 1: Add --fast and --thorough CLI args to skill.yaml

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-planning/skill.yaml`

1. Read `agents/skills/claude-code/harness-planning/skill.yaml`.

2. Replace the existing `cli` block with an expanded version that includes the two new args. The current block is:

   ```yaml
   cli:
     command: harness skill run harness-planning
     args:
       - name: path
         description: Project root path
         required: false
   ```

   Replace with:

   ```yaml
   cli:
     command: harness skill run harness-planning
     args:
       - name: path
         description: Project root path
         required: false
       - name: fast
         description: Skip skeleton pass — produce full plan directly
         required: false
       - name: thorough
         description: Always produce skeleton for approval before full expansion
         required: false
   ```

3. Run: `harness validate`
4. Commit: `feat(planning): add --fast and --thorough CLI args to skill.yaml`

---

### Task 2: Add Rigor Levels section to SKILL.md

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-planning/SKILL.md`

This task adds a new "Rigor Levels" section between "Iron Law" and the Phase 1: SCOPE section, following the same pattern used in the autopilot SKILL.md.

1. Read SKILL.md lines 1-30.

2. Insert the following new section after the Iron Law paragraph (after line 20, the line ending with "...exact file paths, exact commands, and complete code snippets.") and before the `---` separator that precedes Phase 1: SCOPE:

   ```markdown
   ---

   ### Rigor Levels

   The `rigorLevel` is passed to the planner by autopilot (or set via `--fast`/`--thorough` flags in standalone invocation). Default is `standard`.

   | Phase     | `fast`                                                           | `standard` (default)                                      | `thorough`                                                                      |
   | --------- | ---------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
   | SCOPE     | No change — always derive observable truths.                     | No change.                                                | No change.                                                                      |
   | DECOMPOSE | Skip skeleton pass. Produce full tasks directly after file map.  | Skeleton if estimated task count >= 8. Full tasks if < 8. | Always produce skeleton. Require human approval before expanding to full tasks. |
   | SEQUENCE  | No change — always order by dependency.                          | No change.                                                | No change.                                                                      |
   | VALIDATE  | No change — always run harness validate and verify completeness. | No change.                                                | No change.                                                                      |

   The skeleton pass is the primary rigor lever for planning. Fast mode trusts the direction and goes straight to full detail. Thorough mode always validates direction before investing tokens in full task expansion.
   ```

3. Run: `harness validate`
4. Commit: `feat(planning): add rigor levels section to SKILL.md`

---

### Task 3: Add two-pass skeleton workflow to Phase 2 (DECOMPOSE)

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-planning/SKILL.md`

This task inserts the skeleton generation step into Phase 2: DECOMPOSE, between step 1 (file map) and step 2 (task decomposition). This is the core two-pass planning change.

1. Read SKILL.md lines 114-165.

2. After step 1 ("Map the file structure first.") and before step 2 ("Decompose into atomic tasks."), insert a new step. Find the text:

   ```
   2. **Decompose into atomic tasks.** Each task must:
   ```

   Insert the following before it (the existing steps 2, 3, 4 become steps 3, 4, 5):

   ```markdown
   2. **Skeleton pass (rigor-gated).** Before writing full task details, produce a lightweight skeleton that validates direction. The skeleton is ~200 tokens and catches structural errors before investing in full expansion.

      **Gating logic:**
      - `rigorLevel == "fast"`: Skip this step entirely. Proceed directly to full task decomposition.
      - `rigorLevel == "standard"`: Estimate the task count from the file map. If >= 8 tasks, produce the skeleton and present for approval. If < 8 tasks, skip the skeleton and proceed to full decomposition.
      - `rigorLevel == "thorough"`: Always produce the skeleton and require human approval before expanding.

      **Skeleton format:**
   ```

   ## Skeleton
   1. Foundation types and interfaces (~3 tasks, ~10 min)
   2. Core scoring module with TDD (~2 tasks, ~8 min)
   3. CLI integration and flag parsing (~4 tasks, ~15 min)
   4. Integration tests and validation (~3 tasks, ~10 min)

   **Estimated total:** 12 tasks, ~43 minutes

   ````

   Each line is a logical group of tasks with an estimated count and time. The skeleton does NOT contain file paths, code, or detailed instructions — those come in the expansion step.

   **Approval gate:**

   When the skeleton is produced, present it to the human:

   ```json
   emit_interaction({
     path: "<project-root>",
     type: "confirmation",
     confirmation: {
       text: "Approve skeleton direction?",
       context: "<estimated task count> tasks across <group count> groups. <one-sentence summary of approach>",
       impact: "Approving proceeds to full task expansion. Rejecting allows direction change before detail investment.",
       risk: "low"
     }
   })
   ````

   - **If approved:** Proceed to full task decomposition (step 3).
   - **If rejected:** Ask what should change. Revise the skeleton. Re-present for approval. Do not expand until approved.

   ```

   Then renumber the existing steps: old step 2 becomes step 3, old step 3 becomes step 4, old step 4 becomes step 5.

   Specifically, change:
   - `2. **Decompose into atomic tasks.**` to `3. **Decompose into atomic tasks.**`
   - `3. **Write complete instructions for each task.**` to `4. **Write complete instructions for each task.**`
   - `4. **Include checkpoints.**` to `5. **Include checkpoints.**`

   ```

3. Run: `harness validate`
4. Commit: `feat(planning): add two-pass skeleton workflow to DECOMPOSE phase`

---

### Task 4: Update Plan Document Structure to include Skeleton section

**Depends on:** Task 3
**Files:** `agents/skills/claude-code/harness-planning/SKILL.md`

This task adds an optional Skeleton section to the plan document template.

1. Read SKILL.md lines 260-315 (the Plan Document Structure section).

2. In the plan template, after the `## File Map` section and before `## Tasks`, insert a skeleton section. Find:

   ```markdown
   ## File Map

   - CREATE path/to/file.ts
   - MODIFY path/to/other-file.ts

   ## Tasks
   ```

   Replace with:

   ```markdown
   ## File Map

   - CREATE path/to/file.ts
   - MODIFY path/to/other-file.ts

   ## Skeleton (if produced)

   1. <group name> (~N tasks, ~N min)
   2. <group name> (~N tasks, ~N min)

   **Estimated total:** N tasks, ~N minutes

   _Skeleton approved: yes/no. If no, note the revision._

   ## Tasks
   ```

3. Run: `harness validate`
4. Commit: `feat(planning): add skeleton section to plan document structure`

---

### Task 5: Update Success Criteria, Harness Integration, and Examples

**Depends on:** Task 4
**Files:** `agents/skills/claude-code/harness-planning/SKILL.md`

1. Read SKILL.md lines 350-484 (Harness Integration, Success Criteria, Examples, Gates sections).

2. **In the Harness Integration section**, add a new bullet point after the existing list (after the `emit_interaction` bullet):

   ```markdown
   - **Rigor levels** — `--fast` / `--thorough` flags control the skeleton pass in DECOMPOSE. Fast skips skeleton entirely. Standard produces skeleton for plans with >= 8 tasks. Thorough always produces skeleton and requires approval. See the Rigor Levels table for details.
   - **Two-pass planning** — Skeleton pass produces a ~200-token outline before full task expansion. Catches directional errors early. Gated by rigor level and estimated task count.
   ```

3. **In the Success Criteria section**, add new criteria after the existing list (after "The human has reviewed and approved the plan"):

   ```markdown
   - When `rigorLevel` is `fast`, the skeleton pass is skipped and full tasks are produced directly
   - When `rigorLevel` is `thorough`, a skeleton is always produced and requires human approval before expansion
   - When `rigorLevel` is `standard` and task count >= 8, a skeleton is produced for approval
   - When `rigorLevel` is `standard` and task count < 8, the skeleton is skipped
   - The skeleton format is lightweight (~200 tokens): numbered groups with task count and time estimates
   ```

4. **In the Examples section**, update the existing example to show skeleton usage. After the existing `**File Map:**` block and before `**Task 1: Define notification types**`, insert:

   ```markdown
   **Skeleton (standard mode, 6 tasks — skeleton skipped because < 8 tasks)**

   _Skeleton not produced — task count (6) below threshold (8)._
   ```

   Then add a second example after the existing example that demonstrates skeleton approval:

   ```markdown
   ### Example: Planning with Skeleton (thorough mode)

   **Goal:** Add rate limiting to all API endpoints.

   **Skeleton (thorough mode — always produced):**
   ```

   ## Skeleton
   1. Rate limit types and configuration (~2 tasks, ~7 min)
   2. Rate limit middleware with Redis backend (~3 tasks, ~12 min)
   3. Route integration and per-endpoint config (~4 tasks, ~15 min)
   4. Integration tests and load verification (~3 tasks, ~10 min)

   **Estimated total:** 12 tasks, ~44 minutes

   ```

   _Presented for approval. User approved. Expanded to full tasks._
   ```

5. Run: `harness validate`
6. Commit: `feat(planning): update success criteria, integration docs, and examples for rigor levels`

---

## Traceability Matrix

| Observable Truth                                  | Delivered By                       |
| ------------------------------------------------- | ---------------------------------- |
| 1. `--fast` skips skeleton pass                   | Task 3 (gating logic in DECOMPOSE) |
| 2. `--thorough` always produces skeleton          | Task 3 (gating logic in DECOMPOSE) |
| 3. `--standard` with >= 8 tasks produces skeleton | Task 3 (gating logic in DECOMPOSE) |
| 4. `--standard` with < 8 tasks skips skeleton     | Task 3 (gating logic in DECOMPOSE) |
| 5. skill.yaml declares --fast/--thorough          | Task 1                             |
| 6. Rigor Levels section exists                    | Task 2                             |
| 7. Skeleton step exists in DECOMPOSE              | Task 3                             |
| 8. Skeleton format is ~200 tokens                 | Task 3 (format specification)      |
| 9. Plan Document Structure includes Skeleton      | Task 4                             |
| 10. Success Criteria updated                      | Task 5                             |
| 11. harness validate passes                       | Every task                         |
