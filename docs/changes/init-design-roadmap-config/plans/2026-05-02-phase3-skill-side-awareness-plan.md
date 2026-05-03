# Plan: Phase 3 — Skill-Side Awareness (`design.enabled` short-circuit in `harness-design-system`)

**Date:** 2026-05-02
**Spec:** `docs/changes/init-design-roadmap-config/proposal.md`
**Phase:** 3 of 5 (Skill-Side Awareness)
**Tasks:** 2
**Time:** ~7 min
**Integration Tier:** small
**Rigor:** standard
**Session:** `changes--init-design-roadmap-config--proposal`

---

## Goal

Update `agents/skills/claude-code/harness-design-system/SKILL.md` Phase 1 step 2 so the runtime contract for `design.enabled` is explicit in the skill's instructions: read `design.enabled` from `harness.config.json` first, short-circuit when `false`, behave normally when `true`, and prompt the user when absent. After the edit, verify by inspection that the `on_new_feature` trigger declared in `skill.yaml` reaches the new short-circuit gate (no separate trigger code path exists; the skill's own Phase 1 step 2 IS the gate).

## Observable Truths (Acceptance Criteria, EARS-framed)

These truths describe what the SKILL.md document must state after the edit, plus the verification that the trigger respects the gate. The skill is invoked at runtime by Claude (or another agent) following the SKILL.md instructions — no executable code changes; the contract lives in the prose.

1. **Ubiquitous:** `agents/skills/claude-code/harness-design-system/SKILL.md` Phase 1 step 2 ("Check harness configuration") shall list `design.enabled` as a field read from `harness.config.json`, alongside the existing `design.strictness`, `design.platforms`, `design.tokenPath`, and `design.aestheticIntent` entries.
2. **Event-driven:** When `design.enabled` is `false`, the skill (per SKILL.md instructions) shall short-circuit Phase 1 — emit a brief log line indicating the project explicitly declined a design system and stop execution before Phase 2 (DEFINE) begins.
3. **Event-driven:** When `design.enabled` is `true`, the skill shall continue Phase 1 normally (proceed to step 3 framework detection and onward through DEFINE / GENERATE / VALIDATE).
4. **Event-driven:** When `design.enabled` is absent (the field does not appear under `design`), the skill shall fall through to existing behavior — surface a gentle prompt asking the user whether to enable the design system before proceeding.
5. **Ubiquitous:** The short-circuit instruction in SKILL.md shall reference `harness.config.json` by name and specify the exact field path `design.enabled`.
6. **Ubiquitous:** The short-circuit instruction shall be placed _first within step 2_ (before the existing list of fields) so the skill aborts before doing further configuration work when the user has declined.
7. **Ubiquitous:** SKILL.md "When to Use" section shall not be altered (the trigger declarations live in `skill.yaml`, not the prose; no edits there).
8. **Ubiquitous:** `agents/skills/claude-code/harness-design-system/skill.yaml` shall continue to list `on_new_feature` and `on_project_init` in `triggers` (verified unchanged at lines 6-9). No yaml edit is required for Phase 3.
9. **Ubiquitous:** The Phase 3 verification shall confirm by inspection that `on_new_feature` (declared in `skill.yaml:8`) routes to the same `harness-design-system/SKILL.md` Phase 1 step 2 gate — i.e., there is no separate `on_new_feature` runtime config that bypasses the SKILL.md instructions.
10. **Ubiquitous:** `harness validate` shall pass after the edits (no schema or linting regressions; the file edited is markdown only).

## Out of Scope (Phase 3)

- Schema changes (`design.enabled` shape) — already shipped in Phase 1.
- Init skill prompts that _write_ `design.enabled` — already shipped in Phase 2.
- `docs/reference/skills-catalog.md` description updates — Phase 4 of the spec.
- Six-path init verification (3 design × 2 roadmap) — Phase 5 of the spec.
- Editing `harness-design-system/skill.yaml` — `on_new_feature` is already declared at line 8; the trigger fires the skill, which then reads `design.enabled` per the new SKILL.md instruction. No yaml change needed.
- Any change to Phase 2/3/4 of `harness-design-system/SKILL.md` — only Phase 1 step 2 is touched.
- Adding code that reads `harness.config.json` from a TypeScript module — `harness-design-system` is a `rigid` skill type (`skill.yaml:36`) executed by an LLM following SKILL.md instructions; the contract is enforced via the prose, not via a runtime guard in `packages/`.
- Refactoring the existing fields list (`design.strictness`, `design.platforms`, `design.tokenPath`, `design.aestheticIntent`) — they remain documented as-is.

## Uncertainties

- **[ASSUMPTION]** `harness-design-system` has no executable runtime layer that reads `harness.config.json` independently of the SKILL.md instructions. Verified: `skill.yaml:36` lists `type: rigid` (LLM-driven, prose-defined); no `packages/` module imports `design.enabled` for this skill. If a future change introduces a TypeScript pre-flight that reads the field, that pre-flight must respect the same short-circuit contract — out of Phase 3 scope, but flagged for future maintainers.
- **[ASSUMPTION]** "Verify `on_new_feature` trigger respects `design.enabled`" (spec implementation order item #10) is a documentation-and-inspection check, not a test execution. The trigger fires the skill; the skill (per SKILL.md after this edit) then reads `design.enabled`. There is no separate trigger code path. The verification step in this plan reads `skill.yaml` to confirm the trigger is declared and reads the new SKILL.md region to confirm the gate is in place. End-to-end runtime validation across the 6 init paths is Phase 5 territory.
- **[ASSUMPTION]** The short-circuit emit is described as a brief log line in the prose, e.g., `"design.enabled is false in harness.config.json — project explicitly declined the design system. Skipping."`. Exact wording is captured verbatim in the Task 1 text insert below; reviewers may polish during execution but the _behavior_ (log + abort) is the contract.
- **[ASSUMPTION]** The "absent" branch ("fire gentle prompt asking the user to decide") matches the pre-edit behavior of Phase 1 step 2, which today reads four fields and proceeds with whatever it finds. After the edit, the prose makes the prompt explicit: "If the field is absent, ask the user whether to enable the design system before proceeding." Today this prompt was implicit; now it is explicit, matching proposal.md:96-100.
- **[DEFERRABLE]** Whether to also add a "Rationalizations to Reject" row covering "the user did not say no, just did not configure it — I will proceed silently" or similar. Useful but not strictly required by the spec — leave to executor discretion. Plan does not force this addition.

## File Map

```
MODIFY agents/skills/claude-code/harness-design-system/SKILL.md
       Phase 1 step 2 (lines 28-32) — prepend a short-circuit gate paragraph
         describing the tri-state runtime contract for design.enabled, and add
         design.enabled as the first bullet in the existing field list.

VERIFY (read-only) agents/skills/claude-code/harness-design-system/skill.yaml
       Confirm `on_new_feature` is declared in `triggers` (line 8) — no edit.
```

No new files. No deletions. No code changes (markdown-only edit to a single SKILL.md file plus a read-only verification of a yaml file).

## Skeleton

1. **Phase 1 step 2 short-circuit insertion** — verbatim text edit in `harness-design-system/SKILL.md` (~1 task, ~5 min)
2. **Trigger verification + final validate** — read `skill.yaml`, confirm trigger declaration, run `harness validate`, commit (~1 task, ~2 min)

**Estimated total:** 2 tasks, ~7 min.

_Skeleton approved: implicit (task count 2 < 8 threshold; provided for clarity per standard rigor)._

---

## Tasks

### Task 1: Insert `design.enabled` short-circuit gate into `harness-design-system/SKILL.md` Phase 1 step 2

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-design-system/SKILL.md`
**Skills:** none from advisor list apply directly (Apply tier is empty in SKILLS.md; the relevant precedent is the `harness-i18n-process` Phase 1 step 1 tri-state read at `agents/skills/claude-code/harness-i18n-process/SKILL.md:31-34`).
**Category:** implementation

#### Steps

1. Open `agents/skills/claude-code/harness-design-system/SKILL.md` and locate Phase 1 step 2. Today the block reads (lines 28-32):

   ```markdown
   2. **Check harness configuration.** Read `harness.config.json` for:
      - `design.strictness` -- enforcement level (`strict`, `standard`, `permissive`)
      - `design.platforms` -- which platforms are enabled (web, mobile)
      - `design.tokenPath` -- path to tokens file (default: `design-system/tokens.json`)
      - `design.aestheticIntent` -- path to design intent doc (default: `design-system/DESIGN.md`)
   ```

2. Replace that block exactly with the following text (verbatim — do not paraphrase, do not adjust whitespace inside the bullet list, preserve the existing en-dashes and hyphens):

   ```markdown
   2. **Check harness configuration.** Read `harness.config.json` and apply the `design.enabled` short-circuit _before_ doing anything else in Phase 1:
      - If `design.enabled` is `false`: the project explicitly declined a design system during init. Log `"design.enabled is false in harness.config.json — project explicitly declined the design system. Skipping."` and stop. Do not run the rest of Phase 1, Phase 2, Phase 3, or Phase 4.
      - If `design.enabled` is `true`: proceed normally with the rest of Phase 1.
      - If `design.enabled` is absent (the field does not appear under `design`): the project has not decided yet. Surface a gentle prompt: "This project has not configured a design system. Would you like to enable one now? (yes / no / not now)". On `yes`, proceed with Phase 1. On `no` or `not now`, stop without writing anything to `harness.config.json` (the init skill is the canonical writer of that field).

      After the gate, read the remaining design configuration fields:
      - `design.enabled` -- tri-state design posture (`true` fires this skill, `false` permanent decline, absent prompts the user). Set during `initialize-harness-project` Phase 3 step 5b.
      - `design.strictness` -- enforcement level (`strict`, `standard`, `permissive`)
      - `design.platforms` -- which platforms are enabled (web, mobile)
      - `design.tokenPath` -- path to tokens file (default: `design-system/tokens.json`)
      - `design.aestheticIntent` -- path to design intent doc (default: `design-system/DESIGN.md`)
   ```

   The verbatim insert above:
   - Preserves the existing four fields exactly (same prose, same hyphen style — `--` double-hyphens, NOT em-dashes).
   - Adds `design.enabled` as the first item in the field list with a short description that cross-references the init skill (Phase 2 of this change set).
   - Adds three short-circuit paragraphs covering the tri-state contract from proposal.md:96-100.
   - Uses the literal log string captured in the Uncertainties section so the executor does not synthesize wording.

3. Verify no other section of SKILL.md needs an edit:
   - "When to Use" (lines 6-15): mentions `on_new_feature` and `on_project_init` — both still apply. No edit.
   - Phase 2 / Phase 3 / Phase 4 / Harness Integration / Success Criteria / Examples / Rationalizations / Gates / Escalation: no references to `design.enabled` exist; the gate sits exclusively in Phase 1 step 2. No edits.
   - Re-run a Grep for `design.enabled` against the file after the edit — only the new text should match.

4. Run `harness validate` from the monorepo root. Expect: `v validation passed`.

5. Stage and commit:

   ```bash
   git add agents/skills/claude-code/harness-design-system/SKILL.md
   git commit -m "$(cat <<'EOF'
   docs(harness-design-system): add design.enabled short-circuit gate to Phase 1 step 2

   Phase 3 of init-design-roadmap-config. The skill now reads design.enabled
   from harness.config.json before any other Phase 1 work and short-circuits
   when false (permanent decline), proceeds when true, and prompts when absent.
   Mirrors the tri-state runtime contract from proposal.md:96-100.

   No code change — harness-design-system is a rigid (LLM-driven) skill, so the
   contract is enforced via SKILL.md prose. on_new_feature trigger declared in
   skill.yaml continues to fire the skill, which now reads design.enabled at
   the top of Phase 1.
   EOF
   )"
   ```

#### Acceptance for Task 1

- The exact text block above appears in `harness-design-system/SKILL.md` Phase 1 step 2.
- The four pre-existing field bullets (`strictness`, `platforms`, `tokenPath`, `aestheticIntent`) remain present and unchanged.
- A new bullet for `design.enabled` precedes them.
- Three short-circuit paragraphs precede the field list.
- No other section of SKILL.md is altered.
- `harness validate` passes.
- One commit, message as above.

---

### Task 2: Verify `on_new_feature` trigger declaration and run final validation

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-design-system/skill.yaml` (read-only), repo root for `harness validate`
**Skills:** none
**Category:** integration

#### Steps

1. Read `agents/skills/claude-code/harness-design-system/skill.yaml`. Confirm by inspection that lines 6-9 read:

   ```yaml
   triggers:
     - manual
     - on_new_feature
     - on_project_init
   ```

   If `on_new_feature` is missing or differently named, STOP and escalate — Phase 3 cannot complete because the trigger does not exist. (Expected outcome: present and unchanged from before this plan.)

2. Read the freshly edited `agents/skills/claude-code/harness-design-system/SKILL.md` Phase 1 step 2 region (the lines added in Task 1). Confirm by inspection that the short-circuit gate is the first action described in step 2 and that all three branches (`true` / `false` / absent) are covered.

3. Document the verification chain in the handoff `evidence` field:

   ```
   skill.yaml:8 declares `on_new_feature` in triggers.
   SKILL.md Phase 1 step 2 reads `design.enabled` and applies the tri-state gate.
   Therefore: when on_new_feature fires the skill, the skill follows SKILL.md and respects design.enabled.
   ```

   No code path bypasses the SKILL.md instructions for this `rigid` skill (`skill.yaml:36`).

4. Search for any other location in the repo that might handle `on_new_feature` for `harness-design-system` independently of SKILL.md:

   ```bash
   # Run from repo root. Expect zero hits in packages/ that mention design-system + on_new_feature wiring.
   ```

   Use `Grep` with pattern `harness-design-system` and `on_new_feature` — confirm the only matches inside `packages/` are generic skill-registry code, not a special trigger handler. If a special handler is found, STOP and escalate (the plan's assumption that no separate runtime layer exists would be falsified).

5. Run `harness validate` from repo root. Expect: `v validation passed`.

6. Run `harness check-deps` from repo root. Expect: `v validation passed`.

7. No commit needed for Task 2 unless the verification surfaced a follow-up edit. If it did (e.g., a stale cross-reference discovered in step 4), apply the smallest possible inline fix in a separate commit:

   ```bash
   git add <file>
   git commit -m "docs(harness-design-system): <smallest possible description> (phase 3 cross-ref)"
   ```

   Otherwise: no commit, just record the verification in the handoff.

#### Acceptance for Task 2

- `skill.yaml:8` confirmed to contain `on_new_feature`.
- The new Phase 1 step 2 gate (Task 1) confirmed in place.
- Repo-wide grep confirms no special `on_new_feature` runtime handler bypasses SKILL.md for this skill.
- `harness validate` passes.
- `harness check-deps` passes.
- Handoff `evidence` field documents the verification chain.

---

## Verification Summary

After Task 2 completes:

- `harness-design-system/SKILL.md` Phase 1 step 2 contains the tri-state `design.enabled` short-circuit gate.
- `harness-design-system/skill.yaml` is unchanged but verified to declare `on_new_feature`.
- No other file in the repo is edited.
- One commit (Task 1). Task 2 is verification-only unless a follow-up surfaces.
- `harness validate` and `harness check-deps` pass at repo root.
- The runtime contract from proposal.md:96-100 is now enforceable: when `on_new_feature` (or any other trigger) fires the skill, the skill follows SKILL.md, reads `design.enabled`, and behaves correctly across the three states.

## Handoff to Phase 4

Phase 4 ("Docs & Catalog") updates `docs/reference/skills-catalog.md` to mention design + roadmap configuration in the `initialize-harness-project` description and adds an Examples block. Phase 4 does not depend on Phase 3's edit, but Phase 5 ("Verification") will exercise the 6-path init matrix and verify the gate end-to-end. The handoff `concerns` field carries forward the four pre-existing items from the Phase 2 handoff plus a note that Phase 5 must validate the false / absent / true branches against a real-init scenario.

## Gates

- The exact verbatim text from Task 1 step 2 appears in `harness-design-system/SKILL.md`. No paraphrasing, no whitespace drift inside the bullet list.
- The four pre-existing fields (`strictness`, `platforms`, `tokenPath`, `aestheticIntent`) remain present and described identically to before.
- The short-circuit gate appears _before_ the field list — the order matters because the gate must abort early.
- `skill.yaml` is unchanged (read-only verification).
- No other SKILL.md section is touched.
- `harness validate` and `harness check-deps` pass.
- The commit is markdown-only and atomic.
- No `--no-verify` or `--amend` flags used.
