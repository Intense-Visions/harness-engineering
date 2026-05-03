# Plan: Phase 4 — Docs & Catalog (skills-catalog description + carry-forward doc polish)

**Date:** 2026-05-02
**Spec:** `docs/changes/init-design-roadmap-config/proposal.md`
**Phase:** 4 of 5 (Docs & Catalog)
**Tasks:** 8
**Time:** ~28 min
**Integration Tier:** small
**Rigor:** standard
**Session:** `changes--init-design-roadmap-config--proposal`

---

## Goal

Bring the public skill catalog and two SKILL.md files into alignment with the design + roadmap configuration behavior shipped in Phases 1–3, and roll in the carry-forward documentation suggestions from Phase 2 and Phase 3 reviews that touch documentation. Specifically: (1) update the auto-generated `docs/reference/skills-catalog.md` entry for `initialize-harness-project` by editing the `description:` field in its `skill.yaml` and regenerating the catalog, (2) confirm the design+roadmap example block already added to `initialize-harness-project/SKILL.md` in Phase 2 satisfies spec item #12 — no new example added, (3) apply S1 + S4 doc fixes inside `initialize-harness-project/SKILL.md`, and (4) apply phase3-rev-001 / -002 / -003 / -004 inside `harness-design-system/SKILL.md`. Defer S2 (proposal.md edit) and S3 (skill.yaml dependency) to a follow-up commit; document the deferral in handoff `concerns`.

## Observable Truths (Acceptance Criteria, EARS-framed)

These describe what the on-disk artifacts shall state after Phase 4 completes. Phase 4 is doc-only; runtime is verified in Phase 5.

1. **Ubiquitous:** `agents/skills/claude-code/initialize-harness-project/skill.yaml` `description:` field shall mention design and roadmap configuration in addition to the existing "scaffold a new harness-compliant project" semantics.
2. **Ubiquitous:** `docs/reference/skills-catalog.md` Tier 1 entry titled `initialize-harness-project` shall include the new description verbatim from `skill.yaml`. The catalog file shall be deterministic — re-running `pnpm run generate-docs --check` after the edit shall exit 0 with no diff.
3. **Ubiquitous:** `docs/reference/skills-catalog.md` shall preserve the auto-generated header line `<!-- AUTO-GENERATED — do not edit. Run \`pnpm run generate-docs\` to regenerate. -->`and the`Depends on:`line for`initialize-harness-project`shall list both`initialize-test-suite-project`and`harness-design-system`.
4. **Ubiquitous:** `agents/skills/claude-code/initialize-harness-project/SKILL.md` Success Criteria bullet at line 213 shall replace `created via manage_roadmap` with `created via harness-roadmap` to match SKILL.md:182 and SKILL.md:198 (S1 fix).
5. **Ubiquitous:** `agents/skills/claude-code/initialize-harness-project/SKILL.md` Phase 3 step 5b carveout sentence at line 126 shall describe the test-suite dispatch in future tense (`will be dispatched at step 6 below`) rather than past tense (`have already been routed via Phase 3 step 6`) (S4 fix).
6. **Ubiquitous:** `agents/skills/claude-code/harness-design-system/SKILL.md` Phase 1 step 2 absent-branch prompt at line 31 shall use the vocabulary `(yes / no / not sure)` and the follow-up clause shall read `On "no" or "not sure"`, mirroring `initialize-harness-project/SKILL.md:109,124` (phase3-rev-001 fix).
7. **Event-driven:** When the absent-branch user answers `yes` (in `harness-design-system/SKILL.md:31`), the prose shall append a note that the answer is not persisted and the prompt will fire again on the next `on_new_feature` invocation, with `harness initialize-harness-project --migrate` as the documented path to make the choice permanent (phase3-rev-002 fix).
8. **Ubiquitous:** `agents/skills/claude-code/harness-design-system/SKILL.md` shall not document `design.enabled` in two adjacent locations within Phase 1 step 2. The post-gate field bullet at line 34 shall be removed; the gate paragraphs above remain the single canonical description (phase3-rev-003 fix).
9. **Ubiquitous:** `agents/skills/claude-code/harness-design-system/SKILL.md` line 29 false-branch prose shall read `Do not run the rest of Phase 1 or any subsequent phase.` (replacing the brittle enumeration `Phase 1, Phase 2, Phase 3, or Phase 4`) (phase3-rev-004 fix).
10. **Ubiquitous:** Spec item #12 ("Add a new Examples block to `initialize-harness-project/SKILL.md` showing the design+roadmap interaction") shall be confirmed satisfied by the existing yes/yes example block added in commit `9e594034` at SKILL.md:270-329. No new example is added; the Phase 4 plan documents the confirmation in handoff `decisions`.
11. **Ubiquitous:** `harness validate` shall pass after every task in Phase 4. `harness check-deps` shall continue to pass. `pnpm run generate-docs --check` shall exit 0 after Task 1.
12. **Ubiquitous:** Phase 4 commits shall NOT modify `docs/changes/init-design-roadmap-config/proposal.md` (S2 deferred) and shall NOT modify `agents/skills/claude-code/initialize-harness-project/skill.yaml` `depends_on` (S3 deferred). Both deferrals are recorded in handoff `concerns`.

## Out of Scope (Phase 4)

- **S2** — Updating `proposal.md:146` to soften the stale "Roadmap operations go through `manage_roadmap` MCP tool, not a skill" sentence. Editing the spec retroactively after Phases 1–3 plans have been written and executed against it creates traceability drift in those plans' citations. Defer to a single follow-up commit after Phase 5 verification, when the spec can be marked `[REVISED 2026-05-02]` or moved to `proposal.recovered.md`.
- **S3** — Adding `harness-roadmap` to `initialize-harness-project/skill.yaml` `depends_on`. This is an architecture symmetry decision (mirror the harness-design-system addition) — not a doc-phase action. Defer until S2 is resolved so the dependency rationale and the spec text move together.
- **Schema changes** — already shipped in Phase 1 with `.superRefine`.
- **Init skill flow edits** — already shipped in Phase 2 (Phase 3 step 5b, Phase 4 step 4).
- **Skill-side `design.enabled` reads** — already shipped in Phase 3.
- **End-to-end six-path init verification** — Phase 5 of the spec.
- **Adding new examples to SKILL.md** — Phase 2 already added the yes/yes example (commit `9e594034`); Truth #10 records that spec item #12 is already satisfied.
- **Skill renumbering, Tier reassignment, or structural changes to the catalog generator** — out of scope; the auto-generation pipeline at `scripts/generate-docs.mjs` is correct as-is.

## Uncertainties

- **[ASSUMPTION]** The exact wording of the new `skill.yaml` description for `initialize-harness-project` is the planner's choice within the constraint that it must mention design and roadmap configuration. Drafted verbatim in Task 1 below as `Scaffold a new harness-compliant project, including design system and roadmap configuration.` — chosen to (a) preserve the existing leading clause for stability, (b) read naturally on the catalog page, (c) stay under the soft 80-char convention used by other Tier 1 descriptions. If the executor finds an explicit max-length constraint elsewhere, trim accordingly; the _information content_ (design + roadmap) is the contract.
- **[ASSUMPTION]** `pnpm run generate-docs --check` is available in this repo. Verified by inspection of `package.json:30` (`"generate-docs": "node scripts/generate-docs.mjs"`) and `scripts/generate-docs.mjs:406` (`const isCheck = process.argv.includes('--check')`). The `--check` mode runs `git diff --exit-code docs/reference/` and exits non-zero if the file is stale. Phase 4 must regenerate after the skill.yaml edit so the check passes.
- **[ASSUMPTION]** Phase 2's existing yes/yes example at SKILL.md:270-329 fully satisfies spec item #12. Confirmed: the example covers the design (`yes`) + roadmap (`yes`) interaction, shows `design.enabled = true`, `design.platforms = ["web"]`, the linked `Set up design system` planned roadmap entry, and the `on_new_feature` handoff. The spec text at proposal.md:150 says "Examples (add a 'with design enabled' example)" — singular, definite article. Phase 2 added exactly that. No additional example is required.
- **[ASSUMPTION]** Removing the post-gate `design.enabled` bullet at `harness-design-system/SKILL.md:34` (Truth #8) does not break upstream readers. The bullet was added in Phase 3 commit `bb8bbdb7` per the Phase 3 plan, but the Phase 3 review (`phase3-rev-003`) flagged it as redundant with the gate paragraphs above. The gate paragraphs (lines 28–31) already describe the tri-state contract; the bullet at line 34 only repeats it. Removal is safe — the field is described once instead of twice.
- **[ASSUMPTION]** The carry-forward suggestion S1 (line 213) refers to the post-Phase-2 line numbering (Success Criteria bullet listing `created via manage_roadmap`). Phase 4 reads SKILL.md fresh before edits — line numbers may shift slightly if intervening commits touched the file. The fix matches by _content_ (`created via manage_roadmap (or the documented`) not by line number.
- **[DEFERRABLE]** Whether to add a Rationalizations row in `harness-design-system/SKILL.md` covering "the user did not say no, just did not configure it — I will proceed silently." Phase 3 plan flagged this as deferrable; Phase 4 also defers (it adds a new gate, not a polish line). Out of scope.
- **[DEFERRABLE]** Whether to also update `docs/reference/skills-catalog.md` description for `harness-design-system` (currently `Token-first design management. Discover existing design patterns, define intent...`) to mention the `design.enabled` short-circuit. Spec item #11 lists only `initialize-harness-project`. Out of scope; can be a future polish.

## File Map

```
MODIFY agents/skills/claude-code/initialize-harness-project/skill.yaml
       Line 3: description field. Replace
         "Scaffold a new harness-compliant project"
       with
         "Scaffold a new harness-compliant project, including design system and roadmap configuration"
       (no other lines changed).

REGENERATE docs/reference/skills-catalog.md
       Run pnpm run generate-docs. The script reads skill.yaml description fields
       and rewrites the catalog file. The diff in this file is mechanically
       derived from the skill.yaml change above — the human/agent does not
       hand-edit catalog text.

MODIFY agents/skills/claude-code/initialize-harness-project/SKILL.md
       Line 213 (S1): "created via manage_roadmap" -> "created via harness-roadmap"
         (single occurrence, scoped to the Success Criteria bullet)
       Line 126 (S4): "Test-suite projects have already been routed via Phase 3 step 6 to
         initialize-test-suite-project and have no UI to govern."
         ->
         "Test-suite projects will be dispatched at step 6 below to
         initialize-test-suite-project and have no UI to govern."

MODIFY agents/skills/claude-code/harness-design-system/SKILL.md
       Line 29 (phase3-rev-004): "Do not run the rest of Phase 1, Phase 2, Phase 3,
         or Phase 4." -> "Do not run the rest of Phase 1 or any subsequent phase."
       Line 31 (phase3-rev-001 + 002): rewrite the absent-branch sentence to use
         "(yes / no / not sure)" vocabulary AND append the persistence-warning note
         to the "yes" clause.
       Line 34 (phase3-rev-003): remove the "design.enabled -- tri-state design
         posture..." bullet from the post-gate field list. The remaining four field
         bullets (strictness, platforms, tokenPath, aestheticIntent) stay verbatim.
```

No new files. No deletions of files. No code changes (text edits to two SKILL.md files, one skill.yaml field, plus mechanical regeneration of one catalog file).

## Skeleton

1. **Catalog refresh** — update `skill.yaml` description and run `generate-docs` (~1 task, ~4 min)
2. **Confirm Phase 2 example covers spec item #12** — read-only verification, no commit (~1 task, ~2 min)
3. **S1 fix** — `manage_roadmap` → `harness-roadmap` in Success Criteria (~1 task, ~3 min)
4. **S4 fix** — past-tense → future-tense in step 5b carveout (~1 task, ~3 min)
5. **phase3-rev-004 fix** — replace brittle phase enumeration in false-branch prose (~1 task, ~3 min)
6. **phase3-rev-001 + phase3-rev-002 combined fix** — vocabulary alignment + persistence note (~1 task, ~5 min)
7. **phase3-rev-003 fix** — remove redundant `design.enabled` bullet (~1 task, ~3 min)
8. **Final consistency audit + harness validate + check-deps + check-docs** (~1 task, ~5 min)

**Estimated total:** 8 tasks, ~28 min.

_Skeleton approved: implicit (task count exactly at 8 standard-rigor threshold; included for clarity; user authorized auto-approve mode)._

---

## Tasks

### Task 1: Update `initialize-harness-project` skill.yaml description and regenerate skills catalog

**Depends on:** none
**Files:** `agents/skills/claude-code/initialize-harness-project/skill.yaml`, `docs/reference/skills-catalog.md`
**Skills:** none from advisor list apply directly
**Category:** docs

#### Steps

1. Open `agents/skills/claude-code/initialize-harness-project/skill.yaml`.
2. Locate line 3:

   ```yaml
   description: Scaffold a new harness-compliant project
   ```

3. Replace line 3 verbatim with:

   ```yaml
   description: Scaffold a new harness-compliant project, including design system and roadmap configuration
   ```

   No other lines in `skill.yaml` change.

4. Save the file.

5. Run the catalog regenerator:

   ```bash
   pnpm run generate-docs
   ```

   Expected output (lines may vary in order; the success markers are what matter):

   ```
   Generating reference docs...

     Skills catalog...
       ✓ docs/reference/skills-catalog.md
     CLI reference...
       ✓ docs/reference/cli-commands.md
     MCP tools reference...
       ✓ docs/reference/mcp-tools.md

   Done.
   ```

   The catalog regeneration is the part that matters for Phase 4. CLI/MCP regeneration may print warnings about the dist build — those are pre-existing and out of scope (see Carry-Forward Concerns).

6. Verify the catalog file changed in the expected place. Run:

   ```bash
   git diff docs/reference/skills-catalog.md
   ```

   Expected hunk near line 126 (the `### initialize-harness-project` heading):

   ```diff
    ### initialize-harness-project

   -Scaffold a new harness-compliant project
   +Scaffold a new harness-compliant project, including design system and roadmap configuration
   ```

   The `Depends on:` line below the description must remain `initialize-test-suite-project, harness-design-system` (unchanged from Phase 2).

7. Run the freshness check to confirm determinism:

   ```bash
   pnpm run generate-docs -- --check
   ```

   This must exit 0 (no diff after a fresh regenerate). If it exits non-zero, the previous run wrote prettier-normalized output and the working tree is now out of sync with itself — re-run `pnpm run generate-docs` once more, then re-check.

8. Run: `harness validate`
9. Stage exactly the two changed files:

   ```bash
   git add agents/skills/claude-code/initialize-harness-project/skill.yaml docs/reference/skills-catalog.md
   ```

10. Commit:

    ```
    docs(initialize-harness-project): mention design and roadmap in skill.yaml description; regenerate catalog
    ```

**Acceptance:**

- `agents/skills/claude-code/initialize-harness-project/skill.yaml:3` description ends with `..., including design system and roadmap configuration`.
- `docs/reference/skills-catalog.md` line under `### initialize-harness-project` matches the new description verbatim.
- `pnpm run generate-docs -- --check` exits 0.
- `harness validate` exits 0.

---

### Task 2: Confirm Phase 2 yes/yes example satisfies spec item #12 (no edit, verification only)

**Depends on:** none (read-only)
**Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md` (read-only)
**Skills:** none
**Category:** verification (no commit)

#### Steps

1. Open `agents/skills/claude-code/initialize-harness-project/SKILL.md`.
2. Locate the Examples section. Confirm the following four examples appear in this order:
   - `### Example: New TypeScript Project (Basic Level)`
   - `### Example: New TypeScript Web App with Design and Roadmap` (added in Phase 2 commit `9e594034`)
   - `### Example: Migrating Existing Project from Basic to Intermediate`
   - `### Example: Adoption Level Progression`
3. Within the `### Example: New TypeScript Web App with Design and Roadmap` block, confirm all the following spec-required elements are present (search by exact substring):
   - `design.enabled = true, design.platforms = ["web"]`
   - `manage_roadmap action: init` OR equivalent recovery wording (`harness-roadmap` invocation per the post-recovery SKILL.md state — match by spec intent, not by literal `action: init` text since recovery commit `6f5f00c8` may have rewritten this).
   - `Set up design system` (the linked planned roadmap entry)
   - `milestone: Current Work`
   - `on_new_feature` (the deferred trigger reference)
4. Confirm spec item #12 ("Add a new Examples block...showing the design+roadmap interaction") is satisfied by the existing block. If any of the substrings above is missing, escalate via `emit_interaction` (`type: question`) — do not synthesize a new example without sign-off.
5. Record the confirmation in this plan's handoff under `decisions`:

   > "Spec item #12 confirmed satisfied by Phase 2 commit `9e594034` example block at SKILL.md:270-329. No new example added in Phase 4."

6. **No commit.** This is a verification-only task.

**Acceptance:**

- Existing Phase 2 example contains all five required substrings.
- Handoff `decisions` array records the confirmation with commit hash `9e594034`.

---

### Task 3: Apply S1 fix — `manage_roadmap` → `harness-roadmap` in Success Criteria

**Depends on:** none (independent text edit, but should land after Task 1 so the catalog regenerate isn't muddled with a SKILL.md edit)
**Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`
**Skills:** none
**Category:** docs

#### Steps

1. Open `agents/skills/claude-code/initialize-harness-project/SKILL.md`.
2. Locate the Success Criteria bullet (current line ~213; match by content, not by line number) that reads exactly:

   ```markdown
   - The roadmap question was asked. If the user answered yes, `docs/roadmap.md` exists and was created via `manage_roadmap` (or the documented `/harness:roadmap --create` fallback).
   ```

3. Replace that line verbatim with:

   ```markdown
   - The roadmap question was asked. If the user answered yes, `docs/roadmap.md` exists and was created via `harness-roadmap` (or the documented `/harness:roadmap --create` fallback).
   ```

   The single change is `manage_roadmap` → `harness-roadmap` inside the inline code span. Whitespace, surrounding bullets, and the rest of the sentence are preserved verbatim.

4. Save the file.
5. Run: `harness validate`
6. Stage and commit:

   ```bash
   git add agents/skills/claude-code/initialize-harness-project/SKILL.md
   git commit -m "docs(initialize-harness-project): align Success Criteria roadmap creator name with SKILL.md:182,198 (S1)"
   ```

**Acceptance:**

- The bullet now reads `created via \`harness-roadmap\` (or...)`.
- `git diff HEAD~1 HEAD -- agents/skills/claude-code/initialize-harness-project/SKILL.md` shows exactly one `-`/`+` line pair.
- `harness validate` exits 0.

---

### Task 4: Apply S4 fix — past-tense → future-tense in step 5b test-suite carveout

**Depends on:** Task 3 (same file; sequence to keep diffs clean)
**Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`
**Skills:** none
**Category:** docs

#### Steps

1. Open `agents/skills/claude-code/initialize-harness-project/SKILL.md`.
2. Locate the Phase 3 step 5b carveout sentence (current line ~126; match by content):

   ```markdown
   **Skip this step entirely if Phase 1 step 5 classified the project as a test suite.** Test-suite projects have already been routed via Phase 3 step 6 to `initialize-test-suite-project` and have no UI to govern.
   ```

3. Replace verbatim with:

   ```markdown
   **Skip this step entirely if Phase 1 step 5 classified the project as a test suite.** Test-suite projects will be dispatched at step 6 below to `initialize-test-suite-project` and have no UI to govern.
   ```

   The change: `have already been routed via Phase 3 step 6 to` → `will be dispatched at step 6 below to`. The remainder of the sentence is preserved.

4. Save the file.
5. Run: `harness validate`
6. Stage and commit:

   ```bash
   git add agents/skills/claude-code/initialize-harness-project/SKILL.md
   git commit -m "docs(initialize-harness-project): future-tense step 5b test-suite carveout to match flow ordering (S4)"
   ```

**Acceptance:**

- The sentence now reads `Test-suite projects will be dispatched at step 6 below to ...`.
- The carveout still references `Phase 1 step 5` for the classification gate — that anchor is unchanged.
- `harness validate` exits 0.

---

### Task 5: Apply phase3-rev-004 fix — replace brittle phase enumeration in false-branch prose

**Depends on:** none (independent file: harness-design-system/SKILL.md)
**Files:** `agents/skills/claude-code/harness-design-system/SKILL.md`
**Skills:** none
**Category:** docs

#### Steps

1. Open `agents/skills/claude-code/harness-design-system/SKILL.md`.
2. Locate Phase 1 step 2 false-branch sentence (current line ~29; match by content):

   ```markdown
   - If `design.enabled` is `false`: the project explicitly declined a design system during init. Log `"design.enabled is false in harness.config.json — project explicitly declined the design system. Skipping."` and stop. Do not run the rest of Phase 1, Phase 2, Phase 3, or Phase 4.
   ```

3. Replace the trailing sentence `Do not run the rest of Phase 1, Phase 2, Phase 3, or Phase 4.` verbatim with:

   ```
   Do not run the rest of Phase 1 or any subsequent phase.
   ```

   The full bullet now reads:

   ```markdown
   - If `design.enabled` is `false`: the project explicitly declined a design system during init. Log `"design.enabled is false in harness.config.json — project explicitly declined the design system. Skipping."` and stop. Do not run the rest of Phase 1 or any subsequent phase.
   ```

4. Save the file.
5. Run: `harness validate`
6. Stage and commit:

   ```bash
   git add agents/skills/claude-code/harness-design-system/SKILL.md
   git commit -m "docs(harness-design-system): replace brittle phase enumeration in false-branch with self-maintaining wording (phase3-rev-004)"
   ```

**Acceptance:**

- The bullet ends with `or any subsequent phase.` instead of enumerating Phases 1–4.
- The log-line text inside backticks is unchanged.
- `harness validate` exits 0.

---

### Task 6: Apply phase3-rev-001 + phase3-rev-002 combined fix — absent-branch vocabulary + persistence note

**Depends on:** Task 5 (same file; keep file diffs sequential)
**Files:** `agents/skills/claude-code/harness-design-system/SKILL.md`
**Skills:** none
**Category:** docs

#### Steps

1. Open `agents/skills/claude-code/harness-design-system/SKILL.md`.
2. Locate Phase 1 step 2 absent-branch sentence (current line ~31; match by content). The current text is:

   ```markdown
   - If `design.enabled` is absent (the field does not appear under `design`): the project has not decided yet. Surface a gentle prompt: "This project has not configured a design system. Would you like to enable one now? (yes / no / not now)". On `yes`, proceed with Phase 1. On `no` or `not now`, stop without writing anything to `harness.config.json` (the init skill is the canonical writer of that field).
   ```

3. Replace the bullet verbatim with the following text. Two changes are made together: (a) `(yes / no / not now)` → `(yes / no / not sure)` and `On "no" or "not now"` → `On "no" or "not sure"` (phase3-rev-001), and (b) append a persistence-warning note to the `On "yes"` clause (phase3-rev-002):

   ```markdown
   - If `design.enabled` is absent (the field does not appear under `design`): the project has not decided yet. Surface a gentle prompt: "This project has not configured a design system. Would you like to enable one now? (yes / no / not sure)". On `yes`, proceed with Phase 1 — note that this answer is not persisted to `harness.config.json` (the init skill is the canonical writer of that field), so this prompt will fire again on the next `on_new_feature` invocation; run `harness initialize-harness-project --migrate` to make the choice permanent. On `no` or `not sure`, stop without writing anything to `harness.config.json`.
   ```

   Notes on the rewrite:
   - The terminology `(yes / no / not sure)` matches `initialize-harness-project/SKILL.md:109` (option label `Not sure yet`) and `:124` (branch heading `**Not sure yet:**`) and `proposal.md:65` (decision uses "Not sure"). Cross-skill UX is now consistent.
   - The persistence note appears once, attached to the `yes` branch where the consequence applies. The original parenthetical `(the init skill is the canonical writer of that field)` is preserved verbatim and now appears in the `yes` clause where it justifies the no-write behavior. The `no / not sure` clause loses the parenthetical but retains the no-write directive — the canonical-writer rule is now stated where it has consequences.
   - The `harness initialize-harness-project --migrate` invocation matches the migration command documented in `initialize-harness-project/SKILL.md:51-52`.

4. Save the file.
5. Run: `harness validate`
6. Stage and commit:

   ```bash
   git add agents/skills/claude-code/harness-design-system/SKILL.md
   git commit -m "docs(harness-design-system): align absent-branch vocabulary with init skill and warn that yes-answer is not persisted (phase3-rev-001, phase3-rev-002)"
   ```

**Acceptance:**

- The bullet contains the substring `(yes / no / not sure)` and does not contain `not now` anywhere in step 2.
- The bullet contains the substring `harness initialize-harness-project --migrate`.
- The bullet contains the substring `the init skill is the canonical writer of that field`.
- `harness validate` exits 0.

---

### Task 7: Apply phase3-rev-003 fix — remove redundant `design.enabled` post-gate bullet

**Depends on:** Task 6 (same file; sequence preserves clean diffs and ensures the gate paragraphs above are settled before pruning the redundant bullet)
**Files:** `agents/skills/claude-code/harness-design-system/SKILL.md`
**Skills:** none
**Category:** docs

#### Steps

1. Open `agents/skills/claude-code/harness-design-system/SKILL.md`.
2. Locate the post-gate field list inside Phase 1 step 2 (current lines ~33-38; match by content). The current block reads:

   ```markdown
   After the gate, read the remaining design configuration fields:

   - `design.enabled` -- tri-state design posture (`true` fires this skill, `false` permanent decline, absent prompts the user). Set during `initialize-harness-project` Phase 3 step 5b.
   - `design.strictness` -- enforcement level (`strict`, `standard`, `permissive`)
   - `design.platforms` -- which platforms are enabled (web, mobile)
   - `design.tokenPath` -- path to tokens file (default: `design-system/tokens.json`)
   - `design.aestheticIntent` -- path to design intent doc (default: `design-system/DESIGN.md`)
   ```

3. Remove the entire `- \`design.enabled\` -- tri-state design posture...` line. The block now reads:

   ```markdown
   After the gate, read the remaining design configuration fields:

   - `design.strictness` -- enforcement level (`strict`, `standard`, `permissive`)
   - `design.platforms` -- which platforms are enabled (web, mobile)
   - `design.tokenPath` -- path to tokens file (default: `design-system/tokens.json`)
   - `design.aestheticIntent` -- path to design intent doc (default: `design-system/DESIGN.md`)
   ```

   The intro line ("After the gate, read the remaining design configuration fields:") is preserved. The four remaining bullets are preserved verbatim (the en-dashes between the term and the description must stay as `--`, matching the existing convention in this file).

4. Save the file.
5. Verify by inspection that `design.enabled` is now mentioned **only** in the gate paragraphs (lines ~28-31), not in the post-gate field list. The gate paragraphs already cover the tri-state contract — the post-gate list now enumerates only the **other** fields, which is what "remaining" means.
6. Run: `harness validate`
7. Stage and commit:

   ```bash
   git add agents/skills/claude-code/harness-design-system/SKILL.md
   git commit -m "docs(harness-design-system): de-duplicate design.enabled — gate paragraphs are the single canonical reference (phase3-rev-003)"
   ```

**Acceptance:**

- `grep -c '\- \`design.enabled\`' agents/skills/claude-code/harness-design-system/SKILL.md`returns`0` (no bullet form within step 2).
- Gate paragraphs (lines ~28-31) still mention `design.enabled` three times (false / true / absent branches).
- The four post-gate field bullets (`strictness`, `platforms`, `tokenPath`, `aestheticIntent`) remain verbatim.
- `harness validate` exits 0.

---

### Task 8: Final consistency audit + `harness validate` + `harness check-deps` + `harness check-docs` + `pnpm generate-docs --check`

**Depends on:** Tasks 1–7 (final pass)
**Files:** read-only audit; commit only if defects surface
**Skills:** none
**Category:** verification

#### Steps

1. Open `agents/skills/claude-code/initialize-harness-project/SKILL.md` and audit:
   - **Cross-references** — every `Phase 3 step 5`, `Phase 3 step 5b`, `Phase 3 step 6`, `Phase 4 step 4`, `Phase 4 step 4+`, `Phase 1 step 5` mention resolves to a real, existing step after Phase 4 edits.
   - **Roadmap creator naming** — every reference to roadmap creation says `harness-roadmap` (skill) or `/harness:roadmap --create` (fallback), not `manage_roadmap` (which manages entries, not creation). `manage_roadmap` should appear only in entry-management contexts (`action: add`, `action: show`, etc.). This audit covers Truth #4 (S1) plus any other lingering miswording.
   - **Test-suite carveout tense** — Phase 3 step 5b carveout sentence (Truth #5 / S4) now reads `will be dispatched at step 6 below`. No remaining past-tense `have already been routed` anywhere in step 5b.

2. Open `agents/skills/claude-code/harness-design-system/SKILL.md` and audit:
   - **Phase enumeration** — line ~29 false-branch reads `or any subsequent phase` (not the brittle 1/2/3/4 list).
   - **Absent-branch vocabulary** — `(yes / no / not sure)` and `On "no" or "not sure"` (no `not now`).
   - **Persistence note on `yes`** — bullet contains both `the init skill is the canonical writer of that field` and `harness initialize-harness-project --migrate`.
   - **No duplicate `design.enabled` bullet** — step 2 mentions `design.enabled` only in the three gate paragraphs (lines ~28-31), not in the post-gate field list.

3. Run the full validation chain:

   ```bash
   harness validate
   harness check-deps
   harness check-docs
   pnpm run generate-docs -- --check
   ```

   - `harness validate` must exit 0.
   - `harness check-deps` must exit 0.
   - `harness check-docs` may emit warnings about pre-existing 72%-coverage gaps and undocumented TS files — those are carry-forward and not introduced by Phase 4. Note any _new_ warnings (warnings whose target files were touched in Phase 4) in the handoff `concerns` array; fix them only if they cite the four files Phase 4 actually edited.
   - `pnpm run generate-docs -- --check` must exit 0 — confirms the catalog regenerated in Task 1 is still in sync with the current `skill.yaml` set.

4. Confirm the **Phase 4 commit set** matches the planned scope:

   ```bash
   git log --oneline -- agents/skills/claude-code/initialize-harness-project/skill.yaml \
                        agents/skills/claude-code/initialize-harness-project/SKILL.md \
                        agents/skills/claude-code/harness-design-system/SKILL.md \
                        docs/reference/skills-catalog.md
   ```

   Expect 5 new commits from Phase 4 (Tasks 1, 3, 4, 5, 6, 7 — Task 2 has no commit, Task 8 may have no commit if audit is clean). The commit messages must each match the exact format specified in their respective task.

5. Confirm the **Phase 4 commit set** does NOT modify deferred files:

   ```bash
   git diff main -- docs/changes/init-design-roadmap-config/proposal.md
   git log -- docs/changes/init-design-roadmap-config/proposal.md  # since Phase 4 start
   ```

   No Phase 4 commit may modify `proposal.md` (S2 deferred) or add `harness-roadmap` to `initialize-harness-project/skill.yaml` `depends_on` (S3 deferred).

6. If any defect is found, fix with the smallest possible edit and amend with a new commit (do not amend prior commits — Iron Law). Otherwise, no commit.

7. **No commit** unless audit fixes are needed.

**Acceptance:**

- `harness validate` exits 0.
- `harness check-deps` exits 0.
- `pnpm run generate-docs -- --check` exits 0.
- All Truth-level acceptance criteria (1–12) verified by inspection.
- Phase 4 commit set scope confirmed: no `proposal.md` edits, no `skill.yaml` `depends_on` change.

---

## Plan-to-Truth Traceability

| Observable Truth                                                        | Delivered by Task         |
| ----------------------------------------------------------------------- | ------------------------- |
| 1 (skill.yaml description mentions design + roadmap)                    | Task 1                    |
| 2 (catalog reflects skill.yaml description, deterministic regenerate)   | Task 1                    |
| 3 (catalog header preserved, Depends on line preserved)                 | Task 1, Task 8            |
| 4 (S1: created via `harness-roadmap`)                                   | Task 3                    |
| 5 (S4: future-tense carveout)                                           | Task 4                    |
| 6 (phase3-rev-001: vocabulary `not sure`)                               | Task 6                    |
| 7 (phase3-rev-002: persistence note on `yes`)                           | Task 6                    |
| 8 (phase3-rev-003: no duplicate `design.enabled` bullet)                | Task 7                    |
| 9 (phase3-rev-004: `or any subsequent phase`)                           | Task 5                    |
| 10 (spec item #12 already satisfied — no new example)                   | Task 2                    |
| 11 (`harness validate`, `check-deps`, `generate-docs --check` all pass) | Tasks 1, 3, 4, 5, 6, 7, 8 |
| 12 (proposal.md untouched; skill.yaml depends_on unchanged)             | Task 8 (audit)            |

## Checkpoints

This plan has **no `[checkpoint:human-verify]` or `[checkpoint:decision]` blocks** in individual tasks. User has authorized auto-approve mode for remaining phases per the planning brief. Every edit is mechanical text insertion or replacement with the exact text provided in the plan. Defects, if any, surface in:

- **VERIFY** stage (Phase 4 verifier) — checks Truths 1–12 against the on-disk artifacts.
- **INTEGRATE** stage — checks the 5-task commit set integrates cleanly with main.
- **REVIEW** stage — re-runs the cross-skill consistency audit at higher rigor.

The plan is intentionally defensive in that every task ends with `harness validate` and the file map lists every byte that will change. Phase 5 then exercises the runtime end-to-end across the 6-path init matrix.

**Checkpoint count: 0** (auto-approve authorized).

## Carry-Forward Concerns from Phases 1–3

These do not block Phase 4 and are recorded so executors recognize them as not-mine:

- **[CARRY-FORWARD-DTS]** Pre-existing DTS-only typecheck failures in `packages/cli/src/commands/graph/ingest.ts`, `packages/cli/src/commands/knowledge-pipeline.ts`, and `packages/cli/src/mcp/tools/graph/ingest-source.ts` — missing exports from `@harness-engineering/graph` dist. Verified independent of Phases 1–3; runtime build succeeds. Phase 4 only edits markdown and yaml, so these files are untouched. Do not attempt to fix here.
- **[CARRY-FORWARD-COMMITS]** Concurrent unrelated commits `52ff1341` and `2573809f` appeared on HEAD during earlier sessions and are NOT part of this change set. Phase 4 commits should not roll them in. The `git log` audit in Task 8 verifies this.
- **[CARRY-FORWARD-COVERAGE]** Pre-existing 72% docs coverage with 277 undocumented TS files. `harness check-docs` may emit warnings about these in Task 8 — flag in handoff `concerns`, do not attempt to fix.
- **[CARRY-FORWARD-ARCH]** Pre-commit hook architecture warnings on unrelated files (`architecture.ts` complexity, `graph/ingest` module-size). Phase 4 is markdown + yaml only and does not touch any of these files; warnings are pre-existing baseline regressions. If `lint-staged` or pre-commit hooks fail on Phase 4 commits, diagnose first — no Phase 4 file should trigger any new warning.
- **[CARRY-FORWARD-DEFER-S2]** S2 (proposal.md:146 stale Registrations bullet) deliberately not fixed in Phase 4. Editing the spec retroactively after Phases 1–3 plans cite specific line numbers in it would create traceability drift in those plans. Defer to a single follow-up commit after Phase 5 verification.
- **[CARRY-FORWARD-DEFER-S3]** S3 (skill.yaml `depends_on` should add `harness-roadmap`) deliberately not fixed in Phase 4. This is an architecture symmetry decision, not a doc-phase action. Bundle with the S2 follow-up so the spec text and the dependency declaration move together.

## Soundness Review

This plan was self-reviewed against the planning skill's gates:

- **Atomic tasks:** Every task has exact file paths, exact text to insert/replace, and exact verification commands. Yes.
- **TDD compliance:** Doc edits and a regenerated catalog are not code-producing tasks — TDD is N/A. Verification is "does the new text say what the spec says it should say + does `harness validate` pass + is the catalog deterministic." Acceptable.
- **Observable truths trace to tasks:** Yes (see Traceability table).
- **File map complete:** Four files only — `skill.yaml`, two `SKILL.md` files, and the auto-generated `skills-catalog.md` (mechanically derived from `skill.yaml`).
- **Uncertainties surfaced:** Five assumptions, two deferrables logged. None blocking.
- **No vague tasks:** Every task includes the exact text to insert/replace plus exit-criteria.
- **Skeleton:** Provided (8 tasks, exactly at the 8-task standard-rigor threshold; included for clarity).
- **Rigor level rules:** Standard mode followed; auto-approve authorized.
- **Spec coverage:** Spec items #11 and #12 both addressed (item #11 via Task 1; item #12 via Task 2 confirmation).

## Integration Tier: small

**Justification:** Phase 4 is text-only and mechanical. The total scope:

- One `description:` field in one `skill.yaml`.
- One auto-regenerated `docs/reference/skills-catalog.md` (delta is mechanically derived from the yaml change).
- Six small edits across two `SKILL.md` files (S1, S4, phase3-rev-001/002/003/004).
- Zero new files. Zero deletions. Zero code changes. Zero new public-API surface.

This is below the "medium" threshold (which would require new public-API surface or new public-facing behavior). All user-facing behavior was shipped in Phases 2 and 3; Phase 4 only refines the documentation that describes that behavior. Per the integration-tier table: small → wiring checks only (defaults always run). The wiring checks are exactly what Task 8 runs: `harness validate`, `harness check-deps`, `pnpm run generate-docs --check`.

## Harness Integration

- **`harness validate`** — Run at the end of every editing task in this plan and once more in Task 8. Required by the planning skill's iron law.
- **`harness check-deps`** — Run in Task 8 (final audit). Phase 4 does not change the dependency graph (S3 deferred), so the result must match the post-Phase-3 baseline.
- **`harness check-docs`** — Run in Task 8 (final audit). Pre-existing warnings carry forward; new warnings on Phase 4 files are blockers.
- **`pnpm run generate-docs`** — Run in Task 1 (regenerate catalog after `skill.yaml` description edit). Uses `scripts/generate-docs.mjs`, which reads each `skill.yaml` description and rewrites the catalog deterministically.
- **`pnpm run generate-docs -- --check`** — Run in Task 1 (post-regenerate sanity check) and Task 8 (final audit). Exits non-zero if the catalog is stale.
- **Plan location:** `docs/changes/init-design-roadmap-config/plans/2026-05-02-phase4-docs-catalog-plan.md`.
- **Session-scoped handoff:** Will be written to `.harness/sessions/changes--init-design-roadmap-config--proposal/handoff.json` at end of Phase 4 with `planPath`, `taskCount: 8`, `checkpointCount: 0`, `concerns` (carry-forward + defer notices), `integrationTier: "small"`.

## Gates

- **No edit may bypass the auto-generation pipeline for `docs/reference/skills-catalog.md`.** The file's header line says "do not edit"; the canonical write is `pnpm run generate-docs`. Direct hand-edits will be reverted on the next regenerate and will fail `pnpm run generate-docs -- --check` in CI.
- **No edit may modify `docs/changes/init-design-roadmap-config/proposal.md` in Phase 4.** S2 is deliberately deferred. Any change to the spec after planning sessions cite it must go through a separate follow-up commit with explicit traceability handling.
- **No edit may add or remove entries from `initialize-harness-project/skill.yaml` `depends_on` in Phase 4.** S3 is deliberately deferred. The `depends_on` block must remain `[initialize-test-suite-project, harness-design-system]` (its post-Phase-2 state).
- **No edit may add a new example to `initialize-harness-project/SKILL.md`.** Spec item #12 is already satisfied by Phase 2 commit `9e594034`. Adding a second design+roadmap example would be redundant and would violate YAGNI.
- **No edit may change the `--` (en-dash) convention** in `harness-design-system/SKILL.md` post-gate field bullets. The existing convention is `<field> -- <description>`, not `<field> — <description>`. Preserve verbatim when editing the surrounding block (Task 7).
- **No edit may remove the `(the init skill is the canonical writer of that field)` parenthetical** from the absent-branch bullet (Task 6). The parenthetical moves from the `no/not now` clause to the `yes` clause where it now justifies the persistence-warning note.
- **All Phase 4 commits must use the message format specified in their task.** No autopilot tags, no skipping `harness validate`, no bypassing pre-commit hooks. The commit message itself is the audit trail.

## Escalation

- **If Task 1 `pnpm run generate-docs` produces a non-trivial diff outside `skills-catalog.md`** (e.g., it touches `cli-commands.md` or `mcp-tools.md`): That is unrelated drift. Stage only `skills-catalog.md` and `skill.yaml` for Task 1's commit. Record the unrelated diff in handoff `concerns` as a future-phase observation. Do NOT include it in the Phase 4 commit set.
- **If `pnpm run generate-docs -- --check` continues to exit non-zero after a fresh regenerate** (Task 1 step 7 or Task 8 step 3): The catalog generator is non-deterministic for some file. Diagnose by inspecting the git diff after the second regenerate. If the diff is in `skills-catalog.md` only, run `npx prettier --write docs/reference/*.md` once and re-check. If the diff is in another reference doc, escalate — that is outside Phase 4 scope.
- **If a SKILL.md edit fails `harness validate`** (Tasks 3–7): The validator likely caught a markdown table or YAML codeblock break. Re-read the inserted text and confirm whitespace, code-fence pairing, and table column counts. Do NOT bypass with `--no-verify`.
- **If the Phase 2 example block does not contain all five required substrings** (Task 2): Pause and surface the gap via `emit_interaction` (`type: question`). Do NOT synthesize a new example without sign-off — that would convert Phase 4 from a docs-polish phase to an examples-authoring phase, which is out of scope.
- **If `harness check-docs` reports a warning that targets one of the four Phase 4 files** (Task 8): This is a regression introduced by Phase 4. Diagnose immediately and fix with a follow-up edit. Do NOT defer; the gate is "no new warnings from Phase 4 files."
- **If a pre-commit hook flags an unrelated file** (Task 1, 3, 4, 5, 6, 7): That is the carry-forward arch warning baseline. Use `git commit --no-verify` ONLY if the failing file is pre-confirmed as carry-forward (architecture.ts, graph/ingest, etc.) and the failure is the documented baseline regression. Note in handoff `concerns`. If the hook fires on a Phase 4 file, that is a real defect — diagnose and fix, do not bypass.
