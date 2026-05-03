# Plan: Phase 2 — Init Skill Updates (design + roadmap configuration prompts)

**Date:** 2026-05-02
**Spec:** `docs/changes/init-design-roadmap-config/proposal.md`
**Phase:** 2 of 5 (Init Skill Updates)
**Tasks:** 7
**Time:** ~22 min
**Integration Tier:** medium
**Rigor:** standard
**Session:** `changes--init-design-roadmap-config--proposal`

---

## Goal

Update `agents/skills/claude-code/initialize-harness-project/SKILL.md` and its `skill.yaml` so that during project init, two new decisions are captured and acted on: (1) a Phase 3 step 5b three-way design-system question (mirroring the existing i18n step) that writes `design.enabled` + `design.platforms` to `harness.config.json`, skipped for test suites; and (2) a Phase 4 step 4 binary roadmap question that, when answered yes, calls `manage_roadmap` to create `docs/roadmap.md`, and — only when both new answers are yes — auto-adds a `planned` "Set up design system" item routed to executor `harness-design-system`.

## Observable Truths (Acceptance Criteria, EARS-framed)

These truths describe what the SKILL.md and skill.yaml documents must state. Phase 2 is doc-only; Phase 5 verifies runtime behavior end-to-end. "The skill" below means "the skill as documented in SKILL.md."

1. **Ubiquitous:** `agents/skills/claude-code/initialize-harness-project/SKILL.md` shall contain a Phase 3 step labeled **"Step 5b. Configure design system."** placed between the existing step 5 (i18n) and step 6 (test-suite dispatch).
2. **Event-driven:** When step 5b runs, the skill shall call `emit_interaction` with `type: question`, three structured options (`yes` / `no` / `not-sure`), recommendation index 0 with `confidence: medium`, mirroring the i18n precedent in step 5.
3. **Event-driven:** When the user answers `yes` in step 5b, the skill shall ask a follow-up "Which platforms? `web`, `mobile`, or both?" and write `design.enabled: true` and a non-empty `design.platforms` array to `harness.config.json`.
4. **Event-driven:** When the user answers `no` in step 5b, the skill shall write `design.enabled: false` to `harness.config.json` and not write `design.platforms`.
5. **Event-driven:** When the user answers `not-sure` in step 5b, the skill shall write neither `design.enabled` nor `design.platforms` (preserves the "absent" tri-state from the Phase 1 schema, proposal.md:96).
6. **State-driven:** While the project has been classified as a test suite by Phase 1 step 5, step 5b shall not run (the existing Phase 3 step 6 dispatch already short-circuits the rest of Phase 3 — step 5b must sit before step 6 so this short-circuit is preserved by document order, and the step explicitly re-states the carveout).
7. **Ubiquitous:** SKILL.md Phase 4 step 4 shall be rewritten from an informational nudge ("When you are ready... run `/harness:roadmap --create`") into an active question delivered via `emit_interaction` with `type: question`, two structured options (`yes` / `no`), recommendation index 0, `confidence: medium`.
8. **Event-driven:** When the user answers `yes` to the roadmap question, the skill shall call `manage_roadmap` with `action: init` (with `/harness:roadmap --create` documented as the MCP-unavailable fallback) and verify `docs/roadmap.md` is created.
9. **Event-driven:** When `design.enabled === true` in `harness.config.json` AND the user answers `yes` to the roadmap question, the skill shall call `manage_roadmap` with `action: add`, `feature: "Set up design system"`, `status: "planned"`, `milestone: "Current Work"`, `executor: "harness-design-system"`, skipping silently if a duplicate item already exists.
10. **Unwanted:** If either `design.enabled !== true` OR the user answered `no` to the roadmap question, then the skill shall not auto-add the "Set up design system" roadmap item.
11. **Event-driven:** When the user answers `no` to the roadmap question, the skill shall skip silently and the existing informational nudge ("`/harness:roadmap --create` when ready") shall remain available to the user as fallback documentation.
12. **Ubiquitous:** `agents/skills/claude-code/initialize-harness-project/skill.yaml` `depends_on` shall list both `initialize-test-suite-project` and `harness-design-system`.
13. **Ubiquitous:** SKILL.md **Harness Integration** section shall describe the new design-system question (referencing `harness-design-system` as the deferred executor), the active roadmap question (with `manage_roadmap` and `/harness:roadmap --create` fallback), and the conditional roadmap-link behavior.
14. **Ubiquitous:** SKILL.md **Success Criteria** section shall include criteria covering: design question asked for non-test-suite projects; `design.enabled` recorded per user's answer (true / false / absent); roadmap question asked; `docs/roadmap.md` exists when answered yes; "Set up design system" planned item present when both answers are yes.
15. **Ubiquitous:** SKILL.md **Examples** section shall contain a new example showing the design + roadmap interaction (yes/yes path with the linked roadmap item visible).
16. **Ubiquitous:** SKILL.md cross-references shall remain internally consistent — every reference to "Phase 3 step 5", "Phase 3 step 6", "Phase 4 step 4", "Phase 4 step 4+", and "Phase 1 step 5" shall point to a real, current step after the edits. The "test suites return at Phase 4 step 4+" return point in Phase 1 step 5 and Phase 3 step 6 shall continue to resolve to the new active roadmap question.
17. **Ubiquitous:** SKILL.md **Rationalizations to Reject** table shall be expanded with at least one row covering "I will skip the design question to keep setup fast" (parallel to the existing i18n row).
18. **Ubiquitous:** `harness validate` shall pass after the edits (no schema or linting regressions in the edited files).

## Out of Scope (Phase 2)

- Schema changes — already shipped in Phase 1 (`design.enabled` + `design.platforms` with `.superRefine`).
- Runtime read of `design.enabled` inside `harness-design-system/SKILL.md` — Phase 3 of the spec.
- `docs/reference/skills-catalog.md` description update — Phase 4 of the spec.
- Six-path end-to-end init verification — Phase 5 of the spec.
- Refactoring the existing i18n step (Decision D9 forbids this — keep the working precedent untouched).
- Generalizing into a "capabilities" pattern (Decision D7 forbids).

## Uncertainties

- **[ASSUMPTION]** The example `manage_roadmap` MCP-tool call shape is `action: init` for create and `action: add` with the named fields. This matches the spec's text (proposal.md:75-76) and the harness-roadmap SKILL.md uses `manage_roadmap add` with similar field shapes. If the actual MCP signature differs at execution time, the example block in step 4 may need a small tweak — does not change the plan structure.
- **[ASSUMPTION]** The `executor: "harness-design-system"` field is supported by `manage_roadmap` for routing. The proposal explicitly states "executor `harness-design-system`" (proposal.md:23, 40). If the field is named differently in the MCP tool, only the example wording changes — the documented intent is unambiguous.
- **[ASSUMPTION]** When step 5b is added between current step 5 (i18n) and step 6 (test-suite dispatch), document numbering for steps 5 and 6 stays as-is and step 5b reads naturally — no need to renumber 6 to 7. The spec uses "5b" deliberately to minimize disruption (proposal.md:59).
- **[ASSUMPTION]** The Phase 4 step "Build the Initial Knowledge Graph" appears between step 3 (`harness check-deps`) and step 4 (the roadmap nudge in current SKILL.md, lines 102-111). Edits to step 4 will not alter the knowledge-graph subsection; we only rewrite step 4's body.
- **[ASSUMPTION]** "Skip silently if duplicate" semantics for the linked roadmap item are best documented as a directive ("Do not duplicate — `manage_roadmap add` is expected to be idempotent on `(feature, milestone)` pairs; if it isn't, check first via `manage_roadmap show` and skip when present"). The exact dedupe mechanism is an executor concern, not a planner concern.
- **[DEFERRABLE]** Exact wording of the design-system question, the platforms follow-up, and the roadmap question. Initial drafts taken verbatim from spec text. Reviewers may polish during execution.
- **[DEFERRABLE]** Whether to also add a "linked-item" reject-row to the Rationalizations table (e.g., "I'll skip auto-adding the Set up design system item to keep the roadmap clean"). Useful but not strictly required by the spec — leave to executor judgment.

## File Map

```
MODIFY agents/skills/claude-code/initialize-harness-project/SKILL.md
       Phase 3, after step 5 (i18n, line 81-84): insert new step 5b "Configure design system" with
         emit_interaction example and three-way handling. Re-state the test-suite skip carveout.
       Phase 3 step 6 (line 86, "Test-suite projects only ..."): no edit — its position relative to
         the new 5b is the carveout. Verify cross-reference from Phase 1 step 5 still resolves.
       Phase 4 step 4 (lines 111): rewrite from informational nudge into an active emit_interaction
         question with binary options and conditional design-link sub-step.
       Harness Integration section (lines 115-124): add bullets for design question, active roadmap
         question, manage_roadmap call, and harness-design-system as deferred executor.
       Success Criteria section (lines 126-137): add criteria covering design.enabled state,
         roadmap presence, and linked roadmap item.
       Rationalizations to Reject section (lines 139-148): add a row for "skip the design question."
       Examples section (lines 149-258): add a new example "New TypeScript Web App with Design and
         Roadmap" showing the yes/yes path including the linked roadmap item.

MODIFY agents/skills/claude-code/initialize-harness-project/skill.yaml
       depends_on (line 35-36): add `harness-design-system` alongside the existing
         `initialize-test-suite-project` entry.
```

No new files. No deletions. No code changes (text-only edits to the two skill documents).

## Skeleton

1. **Phase 3 step 5b insertion** — design question with three-way response and skip carveout (~1 task, ~4 min)
2. **Phase 4 step 4 rewrite** — active roadmap question + conditional design-link sub-step (~1 task, ~4 min)
3. **Skill manifest update** — `skill.yaml` `depends_on` (~1 task, ~2 min)
4. **Harness Integration + Success Criteria** — reflect new behavior (~1 task, ~3 min)
5. **Rationalizations row** — parallel "skip the design question" entry (~1 task, ~2 min)
6. **Examples expansion** — yes/yes design+roadmap walkthrough (~1 task, ~4 min)
7. **Internal consistency + final validation** — cross-reference audit + `harness validate` (~1 task, ~3 min)

**Estimated total:** 7 tasks, ~22 min.
_Skeleton approved: implicit (task count 7 < 8 threshold; provided for clarity per standard rigor)._

## Tasks

### Task 1: Insert Phase 3 step 5b "Configure design system" into SKILL.md

**Depends on:** none
**Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`
**Skills:** none from advisor list apply directly (Apply tier is empty in SKILLS.md; the relevant precedent is the existing step 5 i18n block)

1. Open `agents/skills/claude-code/initialize-harness-project/SKILL.md`.
2. Locate the existing Phase 3 step 5 "Configure i18n (all levels)" block ending at line 84 (`...The project can enable i18n later by running `harness-i18n-workflow` directly.`).
3. Insert a new step 5b directly after the closing line of step 5 and before the existing step 6 "Test-suite projects only" header. Use this exact text:

   ````markdown
   5b. **Configure design system (non-test-suite projects).** Ask: "Will this project have a UI requiring a design system?" Mirror the i18n step's three-way response shape. Use `emit_interaction`:

       ```json
       emit_interaction({
         type: "question",
         question: {
           text: "Will this project have a UI requiring a design system?",
           options: [
             {
               label: "Yes — capture design intent now",
               pros: ["Records platforms in harness.config.json", "harness-design-system fires automatically on first design-touching feature"],
               cons: ["One extra follow-up question (which platforms)"],
               risk: "low",
               effort: "low"
             },
             {
               label: "No — this project has no UI",
               pros: ["No future design nudges", "Permanent decline recorded"],
               cons: ["Re-running init is required if a UI is added later"],
               risk: "low",
               effort: "low"
             },
             {
               label: "Not sure yet",
               pros: ["Decision deferred without commitment", "Can run harness-design-system later"],
               cons: ["No design.enabled flag set; on_new_feature will prompt later"],
               risk: "low",
               effort: "low"
             }
           ],
           recommendation: { optionIndex: 0, reason: "Most product/service projects benefit from a centralized design system", confidence: "medium" }
         }
       })
       ```

       Based on the answer:
       - **Yes:** Ask a follow-up: "Which platforms? `web`, `mobile`, or both?" Write `design.enabled: true` and `design.platforms: [...]` (a non-empty array of `web` and/or `mobile`) to `harness.config.json`. Inform the user: "Design tokens will be generated when you start your first design-touching feature — `harness-design-system` fires automatically via `on_new_feature`."
       - **No:** Write `design.enabled: false` to `harness.config.json`. Do not write `design.platforms`. The `on_new_feature` trigger respects this flag and will not fire `harness-design-system`.
       - **Not sure yet:** Do not write `design.enabled` or `design.platforms`. The project can enable design later by running `harness-design-system` directly; `on_new_feature` will prompt gently when a feature touches user-facing UI.

       **Skip this step entirely if Phase 1 step 5 classified the project as a test suite.** Test-suite projects have already been routed via Phase 3 step 6 to `initialize-test-suite-project` and have no UI to govern.
   ````

4. Save the file.
5. Verify visually that step 5 (i18n), step 5b (new), and step 6 (test-suite dispatch) appear in that order with no orphaned headings.
6. Run: `harness validate`
7. Commit: `feat(initialize-harness-project): add Phase 3 step 5b for design-system configure-only question`

---

### Task 2: Rewrite Phase 4 step 4 from nudge into active roadmap question with conditional design-link

**Depends on:** Task 1 (must follow so step 5b is established before step 4 references `design.enabled`)
**Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`
**Skills:** none from advisor list apply directly

1. Open `agents/skills/claude-code/initialize-harness-project/SKILL.md`.
2. Locate the current Phase 4 step 4 at line 111:

   ```markdown
   4. **Mention roadmap.** After validation passes, inform the user: "When you are ready to set up a project roadmap, run `/harness:roadmap --create`. This creates a unified `docs/roadmap.md` that tracks features, milestones, and status across your specs and plans." This is informational only — do not create the roadmap automatically.
   ```

3. Replace the entire step (single line above) with this exact text:

   ````markdown
   4. **Set up project roadmap.** Ask: "Set up a project roadmap now? `docs/roadmap.md` tracks features, milestones, and status across your specs and plans." Use `emit_interaction`:

      ```json
      emit_interaction({
        type: "question",
        question: {
          text: "Set up a project roadmap now?",
          options: [
            {
              label: "Yes — create docs/roadmap.md now",
              pros: ["Roadmap visible from day one", "Future specs auto-discovered on next sync"],
              cons: ["Adds one file to the initial commit"],
              risk: "low",
              effort: "low"
            },
            {
              label: "No — skip for now",
              pros: ["Smaller initial footprint"],
              cons: ["Run `/harness:roadmap --create` later when ready"],
              risk: "low",
              effort: "low"
            }
          ],
          recommendation: { optionIndex: 0, reason: "Validation has just passed — a tangible 'project works' signal is the right moment to introduce planning artifacts", confidence: "medium" }
        }
      })
      ```

      Based on the answer:
      - **Yes:** Call `manage_roadmap` with `action: init` to create `docs/roadmap.md` (fall back to `/harness:roadmap --create` if the MCP tool is unavailable, then warn: "External sync skipped (MCP unavailable). Run `manage_roadmap sync` when MCP is restored."). Verify the file exists.
        - **If `design.enabled === true` in `harness.config.json`** (set by Phase 3 step 5b), call `manage_roadmap` again with `action: add`, `feature: "Set up design system"`, `status: "planned"`, `milestone: "Current Work"`, `executor: "harness-design-system"`. Skip silently if `manage_roadmap show` reports a duplicate `(feature, milestone)` pair. This closes the loop between deferred design intent and visible planning work.
      - **No:** Skip silently. The user can still run `/harness:roadmap --create` later — that informational fallback remains valid.
   ````

4. Save the file.
5. Verify visually that step 4 (the new active question) sits between the **Build the Initial Knowledge Graph** subsection and step 5 (commit). Both surrounding sections must remain unchanged.
6. Run: `harness validate`
7. Commit: `feat(initialize-harness-project): promote Phase 4 step 4 from nudge to active roadmap question with conditional design link`

---

### Task 3: Add `harness-design-system` to `skill.yaml` `depends_on`

**Depends on:** none (independent of SKILL.md edits)
**Files:** `agents/skills/claude-code/initialize-harness-project/skill.yaml`
**Skills:** none from advisor list apply directly

1. Open `agents/skills/claude-code/initialize-harness-project/skill.yaml`.
2. Locate the `depends_on` block at lines 35-36:

   ```yaml
   depends_on:
     - initialize-test-suite-project
   ```

3. Add `harness-design-system` so the block reads:

   ```yaml
   depends_on:
     - initialize-test-suite-project
     - harness-design-system
   ```

4. Save the file.
5. Run: `harness validate` to confirm skill manifest still parses.
6. Run: `harness check-deps` to confirm dependency graph still resolves.
7. Commit: `chore(initialize-harness-project): add harness-design-system to depends_on`

---

### Task 4: Update Harness Integration and Success Criteria sections

**Depends on:** Task 1, Task 2 (these establish the new behavior the sections must describe)
**Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`
**Skills:** none from advisor list apply directly

1. Open `agents/skills/claude-code/initialize-harness-project/SKILL.md`.
2. In the **Harness Integration** section (currently lines 115-124), replace the existing **Roadmap nudge** bullet (last bullet) with two new bullets and add one design bullet immediately after the i18n bullet. The result should read:

   ```markdown
   - **`harness-i18n-workflow configure` + `harness-i18n-workflow scaffold`** — Invoked during Phase 3 if the project will support multiple languages. Sets up i18n configuration and translation file structure.
   - **`harness-design-system` (deferred via `on_new_feature`)** — Phase 3 step 5b records `design.enabled` + `design.platforms` in `harness.config.json` but does NOT run the full design-system skill. Token generation defers to the first design-touching feature, where `harness-design-system` fires via `on_new_feature` and reads `design.enabled` to decide whether to proceed.
   - **`initialize-test-suite-project`** — Sub-skill. Invoked during Phase 3 step 6 when Phase 1 step 5 classified the project as a test suite. Owns archetype selection, shared-library vs in-repo decision, layer variants, tag taxonomy, reporter stack, custom report, and "prove the guards fire" verification.
   - **`manage_roadmap` MCP tool** — Phase 4 step 4 calls `manage_roadmap` with `action: init` to create `docs/roadmap.md` when the user opts in. When `design.enabled === true`, also calls `manage_roadmap` with `action: add` to insert a `planned` "Set up design system" item routed to executor `harness-design-system`. Falls back to `/harness:roadmap --create` if MCP is unavailable.
   ```

   Note that the existing `initialize-test-suite-project` bullet is preserved verbatim — the change is removing the "Roadmap nudge" bullet and inserting the two new bullets in the right positions.

3. In the **Success Criteria** section (currently lines 126-137), add the following bullets after the existing `i18n configuration is set...` bullet (line 136):

   ```markdown
   - For non-test-suite projects, the design-system question was asked and `harness.config.json` reflects the answer: `design.enabled: true` (with `design.platforms` populated) for yes, `design.enabled: false` for no, or absent for not-sure.
   - The roadmap question was asked. If the user answered yes, `docs/roadmap.md` exists and was created via `manage_roadmap` (or the documented `/harness:roadmap --create` fallback).
   - When `design.enabled === true` AND the user answered yes to the roadmap question, `docs/roadmap.md` contains a `planned` entry titled "Set up design system" under milestone `Current Work` with executor `harness-design-system`. The entry is absent in all other answer combinations.
   ```

4. Save the file.
5. Run: `harness validate`
6. Commit: `docs(initialize-harness-project): refresh Harness Integration and Success Criteria for design + roadmap prompts`

---

### Task 5: Add a Rationalizations row covering "skip the design question"

**Depends on:** Task 1 (referenced behavior must exist before being defended)
**Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`
**Skills:** none from advisor list apply directly

1. Open `agents/skills/claude-code/initialize-harness-project/SKILL.md`.
2. In the **Rationalizations to Reject** section (currently lines 139-148), add a new row immediately after the existing i18n row (`"I will skip the i18n question to keep setup fast"`):

   ```markdown
   | "I will skip the design-system question to keep setup fast" | Phase 3 step 5b requires asking about design and recording the answer in `design.enabled`. Skipping creates ambiguity about whether the omission was intentional and bypasses the linkage between init and the deferred `harness-design-system` invocation on `on_new_feature`. |
   ```

3. Verify the table columns line up (the new row is wide; trim trailing whitespace if Markdown linting flags it).
4. Save the file.
5. Run: `harness validate`
6. Commit: `docs(initialize-harness-project): add rationalization row defending design-question requirement`

---

### Task 6: Add a "design + roadmap (yes/yes)" example to the Examples section

**Depends on:** Task 1, Task 2 (the example narrates the new behavior in those steps)
**Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`
**Skills:** none from advisor list apply directly

1. Open `agents/skills/claude-code/initialize-harness-project/SKILL.md`.
2. In the **Examples** section, add a new example after the **Example: New TypeScript Project (Basic Level)** block (which currently ends near line 189 with `git commit -m "feat: initialize harness project at basic level"`). Insert the following before the **Example: Migrating Existing Project from Basic to Intermediate** heading:

   ```markdown
   ### Example: New TypeScript Web App with Design and Roadmap

   **ASSESS:**
   ```

   Human: "I'm starting a new Next.js web app. Single-language, but it definitely needs a design system."
   Check for .harness/ — not found. Recommend: basic level.
   Phase 1 step 5 classification: not a test suite (Next.js app with src/, no playwright/cypress).

   ````

   **SCAFFOLD:**

   ```bash
   harness init --level basic --framework nextjs
   ````

   **CONFIGURE (Phase 3):**

   ```
   Step 5 (i18n): "Will this project support multiple languages?"
     Human: "No, English only."
     Result: i18n.enabled = false in harness.config.json.

   Step 5b (design): "Will this project have a UI requiring a design system?"
     Human: "Yes."
     Follow-up: "Which platforms? web, mobile, or both?"
     Human: "Web."
     Result: design.enabled = true, design.platforms = ["web"] in harness.config.json.
     Inform: "Design tokens will be generated when you start your first design-touching
     feature — harness-design-system fires automatically via on_new_feature."

   Step 6 (test-suite dispatch): skipped (not a test suite).
   ```

   **VALIDATE (Phase 4):**

   ```
   Step 1: harness validate — pass.
   Step 3: harness check-deps — pass (basic level, no constraints yet).
   Build initial knowledge graph: harness scan — graph populated.

   Step 4 (roadmap): "Set up a project roadmap now?"
     Human: "Yes."
     manage_roadmap action: init — docs/roadmap.md created.
     design.enabled === true detected → manage_roadmap action: add
       feature: "Set up design system"
       status: planned
       milestone: Current Work
       executor: harness-design-system
     Result: docs/roadmap.md contains the planned design item.

   Step 5: commit.
   ```

   ```bash
   git add harness.config.json .harness/ AGENTS.md docs/roadmap.md
   git commit -m "feat: initialize harness project with design and roadmap"
   ```

   **Final state:** `harness.config.json` has `design.enabled: true` + `design.platforms: ["web"]`; `docs/roadmap.md` lists "Set up design system" as a `planned` item under `Current Work`; on the first feature touching UI, `on_new_feature` fires `harness-design-system` which reads `design.enabled` and runs the full discover/define/generate/validate flow.

   ```

   ```

3. Save the file.
4. Verify the new example sits between the "Basic Level" example and the "Migrating from Basic to Intermediate" example. The "Adoption Level Progression" example should remain last.
5. Run: `harness validate`
6. Commit: `docs(initialize-harness-project): add design+roadmap (yes/yes) example`

---

### Task 7: Internal consistency audit + `harness check-deps` final pass

**Depends on:** Tasks 1, 2, 3, 4, 5, 6 (all prior edits must be in place)
**Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md` (read-only audit; edits only if defects found)
**Skills:** none from advisor list apply directly

1. Open `agents/skills/claude-code/initialize-harness-project/SKILL.md` and audit the following cross-references — each must resolve to a current, real step or section:
   - **"Phase 1 step 5"** (test-suite classification) — referenced from Phase 3 step 5b skip note and Phase 3 step 6. Confirm Phase 1 step 5 still exists at its current position.
   - **"Phase 3 step 5"** (i18n) — referenced from the new step 5b's "mirror the i18n step" wording. Confirm step 5 still exists with its three-way `Yes / No / Not sure yet` shape.
   - **"Phase 3 step 5b"** (new) — referenced from the Harness Integration design bullet, the Success Criteria design bullet, and the new Rationalizations row.
   - **"Phase 3 step 6"** (test-suite dispatch) — referenced from Phase 1 step 5 ("dispatch to `initialize-test-suite-project` for Phase 3 configuration") and the Harness Integration `initialize-test-suite-project` bullet. Confirm the existing wording at the top of step 6 still says "Test-suite projects only" and is unchanged.
   - **"Phase 4 step 4+"** (roadmap return point for test suites) — referenced from Phase 1 step 5 ("return here for Phase 4 step 4+") and Phase 3 step 6 ("Return here for Phase 4 step 4+"). The new active roadmap question must be the step they land on. Confirm both references still resolve and that the test-suite path correctly receives the roadmap question (per Decision D8).
   - **"design.enabled"** — every mention should be consistent with the Phase 1 schema: tri-state (`true`, `false`, or absent), `design.platforms` is a `('web' | 'mobile')[]` non-empty when `enabled === true`.
   - **"manage_roadmap"** — every mention should specify the action (`init`, `add`, `show`) being invoked.
2. If any defect is found, fix it inline using the smallest possible edit and amend this task's verification list. If no defects, proceed.
3. Verify the **Examples** section still has the correct ordering: `New TypeScript Project (Basic Level)` → `New TypeScript Web App with Design and Roadmap` (new) → `Migrating Existing Project from Basic to Intermediate` → `Adoption Level Progression`.
4. Verify the **Harness Integration** bullet list has no remaining "Roadmap nudge" entry (the old informational nudge bullet was removed in Task 4).
5. Run: `harness validate`
6. Run: `harness check-deps` — confirm dependency graph still passes after the `skill.yaml` `depends_on` change from Task 3.
7. Run: `harness check-docs` if available (per spec Phase 5 step 15) — flag any inconsistencies, but do not fix them in this phase if they live outside `initialize-harness-project/`.
8. If any fixes were made in step 2, commit: `docs(initialize-harness-project): tighten cross-references after Phase 2 edits`. Otherwise no commit (verification only — note in handoff that audit found no defects).

---

## Plan-to-Truth Traceability

| Observable Truth                                          | Delivered by Task                                         |
| --------------------------------------------------------- | --------------------------------------------------------- |
| 1 (step 5b heading + position)                            | Task 1                                                    |
| 2 (emit_interaction shape, three-way)                     | Task 1                                                    |
| 3 (yes → enabled+platforms write)                         | Task 1                                                    |
| 4 (no → enabled:false write)                              | Task 1                                                    |
| 5 (not-sure → no writes)                                  | Task 1                                                    |
| 6 (test-suite skip)                                       | Task 1 (carveout text), Task 7 (cross-reference audit)    |
| 7 (Phase 4 step 4 active question)                        | Task 2                                                    |
| 8 (yes → manage_roadmap init)                             | Task 2                                                    |
| 9 (design.enabled=true + roadmap=yes → linked item)       | Task 2                                                    |
| 10 (no link in other combos)                              | Task 2                                                    |
| 11 (no → silent skip + fallback nudge)                    | Task 2                                                    |
| 12 (skill.yaml depends_on includes harness-design-system) | Task 3                                                    |
| 13 (Harness Integration section reflects new behavior)    | Task 4                                                    |
| 14 (Success Criteria covers new behavior)                 | Task 4                                                    |
| 15 (Examples has yes/yes walkthrough)                     | Task 6                                                    |
| 16 (cross-references consistent)                          | Task 7                                                    |
| 17 (Rationalizations row added)                           | Task 5                                                    |
| 18 (`harness validate` passes)                            | Tasks 1, 2, 3, 4, 5, 6, 7 (every task ends with validate) |

## Checkpoints

This plan has **no `[checkpoint:human-verify]` or `[checkpoint:decision]` blocks** in individual tasks — each edit is mechanical text insertion or replacement with the exact text provided. The human approval gate happens at plan sign-off (before Task 1) and at the Phase 2 transition gate to Phase 3 (after Task 7). If executors discover ambiguity in spec text mid-task, they should pause and surface a question via `emit_interaction` rather than synthesize new wording.

## Carry-Forward Concerns from Phase 1

These do not block Phase 2 but are recorded so executors recognize them as not-mine:

- **[CARRY-FORWARD]** Pre-existing DTS-only typecheck failures in `packages/cli/src/commands/graph/ingest.ts`, `packages/cli/src/commands/knowledge-pipeline.ts`, and `packages/cli/src/mcp/tools/graph/ingest-source.ts` — missing exports from `@harness-engineering/graph` dist. Verified independent of Phase 1; runtime build succeeds. Phase 2 only edits markdown and YAML, so these files are untouched. Do not attempt to fix here.
- **[CARRY-FORWARD]** On-PATH `/opt/homebrew/bin/harness` is the published v1.27.1 and lacks the new `.superRefine`. If a Phase 2 verification step needs to validate a `harness.config.json` that uses `design.enabled`, use the local CLI build at `packages/cli/dist/bin/harness.js` (per Phase 1 evidence). For Phase 2's actual workload (text edits to skill files), the published CLI is sufficient — `harness validate` against the repo root continues to pass on either.
- **[CARRY-FORWARD]** Two unrelated commits (`52ff1341`, `2573809f`) appeared on HEAD during the Phase 1 session and are NOT part of this change set. Final cross-phase review will see them — flag as out-of-scope and do not roll them into Phase 2 commits.

## Soundness Review

This plan was self-reviewed against the planning skill's gates:

- **Atomic tasks:** Every task has exact file paths, exact text to insert, and exact verification commands. Yes.
- **TDD compliance:** Doc edits are not code-producing tasks — TDD is N/A. Verification is "does the new text say what the spec says it should say + does `harness validate` pass + are cross-references intact." Acceptable per planning skill (TDD is for code-producing tasks).
- **Observable truths trace to tasks:** Yes (see Traceability table).
- **File map complete:** Two files only — SKILL.md and skill.yaml. Yes.
- **Uncertainties surfaced:** Five assumptions, two deferrables logged. None blocking.
- **No vague tasks:** Every task includes the exact text to insert.
- **Skeleton:** Provided (7 tasks, just under the 8-task standard-rigor threshold; included for clarity).
- **Rigor level rules:** Standard mode followed.

## Integration Tier: medium

**Justification:** This phase is text-only but updates the user-facing init flow — every new project from this point forward sees the new prompts. The change adds:

- A new public-surface dependency (`skill.yaml` `depends_on` gains `harness-design-system`).
- New documented behavior in two phases of an entry-point skill.
- A new active interaction (`emit_interaction` calls in two places) that downstream automation can observe.

This is more than a small bug fix or wiring tweak (which would be `small`) but does not introduce a new package, skill, or public API (which would be `large`). Per the integration-tier table: medium → wiring + project updates (changelog/roadmap reflection during Phase 4 of the spec, graph enrichment of the skill change). Phase 2 itself only does the wiring; the docs/catalog updates land in Phase 4 of the spec.

## Harness Integration

- **`harness validate`** — Run at the end of every task in this plan and once more in Task 7. Required by the planning skill's iron law.
- **`harness check-deps`** — Run in Task 3 (after `skill.yaml` change) and in Task 7 (final audit) to confirm the dependency graph still resolves with `harness-design-system` added.
- **`harness check-docs`** — Run in Task 7 if available; flags-only, do not fix non-Phase-2 issues here.
- **`emit_interaction`** — The plan itself does not call this tool, but the documented skill behavior introduces two new `emit_interaction` calls (step 5b design question, step 4 roadmap question). Executors copying the plan's example JSON into SKILL.md should preserve the field shapes (`type`, `question.text`, `question.options[]`, `question.recommendation`).
- **Plan location:** `docs/changes/init-design-roadmap-config/plans/2026-05-02-phase2-init-skill-updates-plan.md`.
- **Session-scoped handoff:** Will be written to `.harness/sessions/changes--init-design-roadmap-config--proposal/handoff.json` after sign-off.

## Gates

- **No edit may merge step 5b into step 5.** Decision D9 explicitly preserves the existing i18n step. Step 5b is a sibling, not a refactor.
- **No edit may remove the "Test-suite projects only" wording from Phase 3 step 6.** Decision D8 relies on it.
- **No edit may set a default value for `design.enabled` in any document.** Decision D3 preserves the absent state — same constraint that drives Phase 1's no-`.default()` decision.
- **No edit may add roadmap link logic that fires when `design.enabled !== true`.** Decision D6 is binary on this — the link only fires when both answers are yes.
- **No new skill, tool, command, or MCP signature is introduced in Phase 2.** This phase is text edits only.

## Escalation

- **If the spec text appears to contradict an existing skill behavior:** Pause, surface the contradiction via `emit_interaction` (`type: question`), do not silently choose one over the other.
- **If `manage_roadmap` MCP tool signature differs from the example shapes in Tasks 2 and 6:** Update the example JSON to match the real signature; the documented intent (init + add `Set up design system`) is what matters, not the exact field names. Note the deviation in the commit message.
- **If `harness validate` or `harness check-deps` fails after a task:** Diagnose root cause. Do NOT bypass with `--no-verify`. Pre-existing carry-forward failures (see Carry-Forward Concerns) should not regress; if they do, that is a real defect introduced by Phase 2 and must be fixed.
- **If audit (Task 7) finds a cross-reference defect that requires editing a section outside Phase 2's scope** (e.g., a stale reference inside `harness-design-system/SKILL.md`): Record the defect in handoff `concerns` for Phase 3 to fix; do not attempt the cross-skill edit here.
