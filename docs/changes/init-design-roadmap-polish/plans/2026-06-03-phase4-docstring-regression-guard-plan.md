# Plan: Phase 4 — Docstring + Regression Guard (FINAL-S3 + D4/D5 Assertions)

**Date:** 2026-06-03
**Spec:** docs/changes/init-design-roadmap-polish/proposal.md
**Session:** changes--init-design-roadmap-polish--proposal
**Predecessor:** Phase 3 (commit 4bbb93d3 — `refactor(init-design-roadmap-polish): extract init-fixture helper (FINAL-S1)`)
**Tasks:** 7
**Time:** ~22 minutes
**Integration Tier:** small
**Rigor:** standard

## Goal

Rewrite the top-of-file docstring in `skill-catalog-consistency.test.ts` to cite the **regression motivation** for each assert (FINAL-S3, per D10), append two new vocabulary-regression assertions (D4 + D5), apply IMP-1 (helper roadmap summary byte-fidelity restoration), apply SUG-1 (spec async-signature amendment), and land all three file edits in a single atomic commit.

## Observable Truths (Acceptance Criteria)

1. The top-of-file comment block of `packages/cli/tests/integration/skill-catalog-consistency.test.ts` no longer contains the existing `// Three asserts:` bullet list verbatim; instead each assert (a/b/c — and now d/e) is accompanied by a **regression-source citation** explaining the historical drift it guards against (FINAL-S3 / D10).
2. `packages/cli/tests/integration/skill-catalog-consistency.test.ts` defines a new module-level constant `PROPOSAL_MD` resolving to `<repo>/docs/changes/init-design-roadmap-config/proposal.md` (narrow scope per Phase 2 verifier scope-note; does NOT scan polish/proposal.md).
3. `packages/cli/tests/integration/skill-catalog-consistency.test.ts` contains a new `it('forbids "Not sure yet" outside emit_interaction button labels', ...)` block (D5) using the spec's window-match regex against `SKILL_MD`.
4. `packages/cli/tests/integration/skill-catalog-consistency.test.ts` contains a new `it('forbids hyphenated "not-sure" in user-facing copy', ...)` block (D4 implementation of regression guard) scanning **only** `SKILL_MD` and `PROPOSAL_MD` (NOT scanning `_helpers/`, NOT scanning the polish proposal.md, NOT scanning init-design-roadmap-config/plans/ or /verification/ — per Phase 3 PD9 carry-forward and Phase 2 verifier scope-note).
5. The roadmap-feature summary string in `packages/cli/tests/integration/_helpers/init-fixture.ts` is restored from the trimmed form `'Run harness-design-system to define palette, typography, and generate W3C DTCG tokens.'` to the byte-faithful pre-Phase-3 form `'Run harness-design-system to define palette, typography, and generate W3C DTCG tokens. Deferred from project init — fires on first design-touching feature via on_new_feature.'` (IMP-1).
6. The `Helper Signature` code block in `docs/changes/init-design-roadmap-polish/proposal.md` (around line 83) corrects the falsified sync signature to the real async one: `export function scaffoldInitFixture(scenario: InitFixtureScenario): Promise<InitFixtureHandle>;` (SUG-1). Adjacent prose acknowledges the async-ness.
7. `npx vitest run packages/cli/tests/integration/skill-catalog-consistency.test.ts` reports **5/5 passing** (3 pre-existing + 2 new D5/D4 assertions).
8. `npx vitest run packages/cli/tests/integration/init-design-roadmap-matrix.test.ts packages/cli/tests/integration/init-design-roadmap-yes-yes-e2e.test.ts packages/cli/tests/integration/skill-catalog-consistency.test.ts` reports **12/12 passing** total (10 existing across the three files + 2 new).
9. `harness validate` exits **1** with **290 issues** — identical to Phase 3 baseline (the test-file additions, helper string lengthening, and one-line spec edit must not perturb arch/design baselines).
10. Single atomic commit contains exactly 3 file paths in its tree: `packages/cli/tests/integration/skill-catalog-consistency.test.ts`, `packages/cli/tests/integration/_helpers/init-fixture.ts`, `docs/changes/init-design-roadmap-polish/proposal.md`. The pre-existing working-tree carry-forwards (`.harness/security/timeline.json`, `.harness/specialization-profiles.json`, `docs/roadmap.md`, `packages/cli/.harness/arch/baselines.json`, and any other untracked plan files in `docs/changes/init-design-roadmap-polish/plans/`) remain unstaged.

## Uncertainties

- [ASSUMPTION] Both `Not sure yet` occurrences in SKILL.md (lines 124, 169) sit inside `label:` strings; the D5 window-regex (32 chars left + 16 right) will accept them. Verified by Phase 2 vocabulary normalization completing and grep showing 0 occurrences in non-`label:` contexts. If wrong, assertion (d) fails on the current tree and the fix is to widen the window or fix the SKILL.md.
- [ASSUMPTION] The D4 hyphenated-`not-sure` regex scoped to `SKILL_MD + PROPOSAL_MD` (init-design-roadmap-config/proposal.md) finds zero matches on the current tree. Verified by `grep -c 'not-sure'` returning 0 for both files.
- [ASSUMPTION] The `PROPOSAL_MD` constant did not pre-exist in the test file (it didn't — verified by absence of any `PROPOSAL_MD` symbol). Adding it as a new top-level `const` is safe.
- [DEFERRABLE] Whether to also add `proposal.md` (the polish one) to a future regression guard — no, by spec scope. The polish proposal.md contains a code-fence hyphenated literal (`'not-sure'` in the `InitFixtureScenario.design` union signature) that is a documented technical identifier per D3.

## File Map

```
MODIFY packages/cli/tests/integration/skill-catalog-consistency.test.ts
        - rewrite top-of-file docstring (FINAL-S3 / D10)
        - add module-level PROPOSAL_MD constant
        - append two new it(...) blocks (D5 + D4 hyphenated-scan)
MODIFY packages/cli/tests/integration/_helpers/init-fixture.ts
        - one-line restore of roadmap summary to longer pre-Phase-3 form (IMP-1)
MODIFY docs/changes/init-design-roadmap-polish/proposal.md
        - amend Helper Signature code block: sync → Promise<...> (SUG-1)
        - adjacent prose touch acknowledging async
```

## Skeleton (Standard Rigor Threshold Check)

Task count: **7** (below the standard-mode threshold of 8). Skeleton pass skipped per Rigor Levels table. Proceeding directly to full task expansion.

## Concerns

- **working-tree cleanliness.** Five carry-forward modifications + one untracked plan file currently sit in the working tree (per Phase 3 handoff `carryForwardUnstaged`): `.harness/security/timeline.json` (M, side-effect of validate), `.harness/specialization-profiles.json` (M, pre-existing), `docs/roadmap.md` (M, pre-existing), `packages/cli/.harness/arch/baselines.json` (M, pre-existing), plus the three untracked Phase 1/2/3 plan files (`docs/changes/init-design-roadmap-polish/plans/2026-06-03-phase{1,2,3}-*.md`). Phase 4's commit must use **explicit `git add` of named files**, NEVER `git add -A` or `git add .`, to avoid sweeping any of those carry-forwards into this commit.
- **spec-amendment-touches-the-polish-spec-itself (informational).** SUG-1 amends the very spec autopilot is executing (`docs/changes/init-design-roadmap-polish/proposal.md`). This is benign — the amendment is a documentation-truth correction in the Helper Signature code block (sync declaration → async reality), not a scope or decision change. No downstream phase reads the amended lines for behavior; only Phase 5's PR description references the spec. The amendment is recorded here for posterity so a reviewer of the Phase 4 commit understands why the spec appears in the diff alongside the test/helper edits.

## Tasks

### Task 1: Baseline snapshot of `skill-catalog-consistency.test.ts` + carry-forward inventory

**Depends on:** none | **Files:** read-only

1. Read `packages/cli/tests/integration/skill-catalog-consistency.test.ts` end-to-end and confirm the current state matches the snapshot in this plan: 3 `it(...)` blocks, constants `REPO_ROOT / SKILL_YAML / SKILL_MD / CATALOG`, top-of-file `// Three asserts:` comment block. NO `PROPOSAL_MD` constant. If state differs, halt and escalate.
2. Run `git status --short` and confirm working-tree state matches Phase 3 handoff `carryForwardUnstaged`: M `.harness/security/timeline.json`, M `.harness/specialization-profiles.json`, M `docs/roadmap.md`, M `packages/cli/.harness/arch/baselines.json`, and at least one `??` plan file under `docs/changes/init-design-roadmap-polish/plans/`. If state differs, halt and escalate.
3. Run `npx vitest run packages/cli/tests/integration/skill-catalog-consistency.test.ts` and confirm 3/3 pass. Capture the exit code (must be 0) and pass count.
4. Run `harness validate` and confirm exit=1, 290 issues (Phase 3 baseline). Capture exit code and issue count.
5. Grep verifications:
   - `grep -c "Not sure yet" agents/skills/claude-code/initialize-harness-project/SKILL.md` → must return 2.
   - `grep -n "Not sure yet" agents/skills/claude-code/initialize-harness-project/SKILL.md` → both lines must show `label: "Not sure yet"` (window pre-check for D5).
   - `grep -c "not-sure" agents/skills/claude-code/initialize-harness-project/SKILL.md docs/changes/init-design-roadmap-config/proposal.md` → must return 0 for both.
6. No file writes. No commit. Output a baseline summary.

### Task 2: Rewrite top-of-file docstring with regression motivation (FINAL-S3 / D10)

**Depends on:** Task 1 | **Files:** `packages/cli/tests/integration/skill-catalog-consistency.test.ts`

1. Replace the existing top-of-file comment block (lines 1–12 inclusive — from `// packages/cli/tests/integration/...` through the closing `// manage_roadmap" (Phase 4 fixed; this guards future regressions).`) with the rewritten docstring below. The replacement explains **why** each assert exists (the regression it guards) rather than just **what** it asserts, per D10.

   **New docstring (exact text to write):**

   ```ts
   // packages/cli/tests/integration/skill-catalog-consistency.test.ts
   //
   // Vocabulary & catalog regression lock for `initialize-harness-project`.
   //
   // Each assertion below guards against a SPECIFIC regression that already
   // happened in this repo — restating the motivation here so a future reader
   // does not weaken or delete an assert without first understanding the
   // history it protects.
   //
   // (a) skill.yaml description appears verbatim in skills-catalog.md
   //     REGRESSION GUARDED: drift between `skill.yaml` and the generated
   //     `docs/reference/skills-catalog.md` (the catalog is regenerated by
   //     `pnpm run generate-docs`; a description edit that skips regen leaves
   //     the catalog stale). Spec source: init-design-roadmap-config #15
   //     (Phase 5 verification report).
   //
   // (b) SKILL.md references both `harness-roadmap` (creator) and
   //     `manage_roadmap` (entry-management MCP tool)
   //     REGRESSION GUARDED: the pre-Phase-4 init flow conflated the two —
   //     SKILL.md described "create roadmap via manage_roadmap", which is
   //     the WRONG tool for creation. Phase 4 of init-design-roadmap-config
   //     split the responsibility: `harness-roadmap` skill creates,
   //     `manage_roadmap` MCP tool adds/edits entries. This assert ensures
   //     both names remain mentioned so neither half of the split disappears.
   //
   // (c) SKILL.md does NOT contain the regression string "created via
   //     manage_roadmap"
   //     REGRESSION GUARDED: that exact phrase was the pre-Phase-4 wording
   //     of the conflated model (see assert (b)). Phase 4 of
   //     init-design-roadmap-config rewrote every occurrence; this assert
   //     prevents the old wording from sneaking back via a careless edit or
   //     a merge from an old branch.
   //
   // (d) `Not sure yet` outside `emit_interaction` button labels fails
   //     REGRESSION GUARDED: init-design-roadmap-polish FINAL-S2 normalized
   //     narrative copy to lowercase `not sure` (no "yet", no hyphen), but
   //     the literal "Not sure yet" survives as a verbatim button-label
   //     string inside `emit_interaction` options (carries the
   //     "you-can-decide-later" UX affordance). Per D5, this assert tightens
   //     the window so any non-button "Not sure yet" — narrative prose,
   //     headings, table cells — fails the suite. Without this guard, the
   //     vocabulary drift FINAL-S2 closed would re-open on the next edit.
   //
   // (e) hyphenated `not-sure` appears nowhere in user-facing copy
   //     REGRESSION GUARDED: the hyphenated form reads as an identifier
   //     shape (e.g. `design.enabled`), not prose. Per D3 it survives only
   //     as a config key or TypeScript string-literal union (e.g.
   //     `InitFixtureScenario.design: 'yes' | 'no' | 'not-sure'` in
   //     `_helpers/init-fixture.ts` — D3 technical-identifier carve-out, OUT
   //     of scope for this assert). The assert scope is intentionally narrow:
   //     `SKILL.md` and `init-design-roadmap-config/proposal.md` only. The
   //     polish proposal.md is excluded because it contains a code-fence
   //     literal of the technical-identifier carve-out; `_helpers/` is
   //     excluded per Phase 3 PD9. Residual hyphenated matches in
   //     init-design-roadmap-config/plans/ + /verification/ are out of
   //     scope per Phase 2 verifier scope-note (historical paper trail).
   //
   // Spec: docs/changes/init-design-roadmap-polish/proposal.md (FINAL-S3, D4, D5, D10).
   // Plan: docs/changes/init-design-roadmap-polish/plans/2026-06-03-phase4-docstring-regression-guard-plan.md
   ```

2. Use `Edit` with `old_string` set to the full literal of lines 1–12 (the existing comment block ending with the closing `// manage_roadmap" (Phase 4 fixed; this guards future regressions).`) and `new_string` set to the new docstring above. Do NOT touch any code below line 12.
3. Run `npx vitest run packages/cli/tests/integration/skill-catalog-consistency.test.ts` to confirm 3/3 still pass (the comment rewrite must not alter behavior).
4. No commit yet.

### Task 3: Add `PROPOSAL_MD` constant + D5 assertion (forbid `Not sure yet` outside button labels)

**Depends on:** Task 2 | **Files:** `packages/cli/tests/integration/skill-catalog-consistency.test.ts`

1. Insert a new `PROPOSAL_MD` constant immediately after the existing `CATALOG` constant declaration (the line currently reading `const CATALOG = path.join(REPO_ROOT, 'docs', 'reference', 'skills-catalog.md');`). The new constant must resolve to `docs/changes/init-design-roadmap-config/proposal.md` — the narrow scope per Phase 2 verifier scope-note.

   **Exact insert (after the `CATALOG` const):**

   ```ts
   const PROPOSAL_MD = path.join(
     REPO_ROOT,
     'docs',
     'changes',
     'init-design-roadmap-config',
     'proposal.md'
   );
   ```

2. Inside the existing `describe('skill catalog ↔ SKILL.md consistency (spec #15)', () => { ... })` block, immediately after the third existing `it(...)` block (the one asserting `not.toMatch(/created via manage_roadmap/)`) and before the closing `});` of the `describe`, append the D5 assertion verbatim from the spec's Vocabulary Regression Assertions section:

   **Exact append (inside the describe, after the 3rd it block):**

   ```ts
   it('forbids "Not sure yet" outside emit_interaction button labels', () => {
     const skillMd = fs.readFileSync(SKILL_MD, 'utf-8');
     const occurrences = [...skillMd.matchAll(/Not sure yet/g)];
     for (const m of occurrences) {
       const window = skillMd.slice(Math.max(0, m.index! - 32), m.index! + 16);
       expect(window).toMatch(/label:\s*["']Not sure yet/);
     }
   });
   ```

3. Run `npx vitest run packages/cli/tests/integration/skill-catalog-consistency.test.ts` and confirm 4/4 pass (3 existing + 1 new D5).
4. No commit yet.

### Task 4: Add D4 hyphenated-`not-sure` assertion with narrow scope (excludes `_helpers/` and polish/proposal.md)

**Depends on:** Task 3 | **Files:** `packages/cli/tests/integration/skill-catalog-consistency.test.ts`

1. Inside the same `describe(...)` block, immediately after the D5 assertion added in Task 3 and before the closing `});` of the `describe`, append the D4 assertion. The spec sample regex (`expect(content).not.toMatch(/not-sure/)`) is acceptable here BECAUSE the scope array is `[SKILL_MD, PROPOSAL_MD]` (init-design-roadmap-config/proposal.md only) — both files have 0 occurrences (verified in Task 1). The polish proposal.md is intentionally **excluded** from the scope array; the `_helpers/init-fixture.ts` file is intentionally **excluded** per Phase 3 PD9.

   **Exact append (inside the describe, after the D5 it block):**

   ```ts
   it('forbids hyphenated "not-sure" in user-facing copy', () => {
     // Scope is intentionally narrow per spec D3 + D4 and the Phase 2
     // verifier scope-note:
     //   - SKILL_MD: user-facing skill prose.
     //   - PROPOSAL_MD: init-design-roadmap-config/proposal.md only.
     // EXCLUDED:
     //   - docs/changes/init-design-roadmap-polish/proposal.md — contains a
     //     code-fence TypeScript literal `'not-sure'` in the
     //     InitFixtureScenario.design union (D3 technical-identifier
     //     carve-out).
     //   - packages/cli/tests/integration/_helpers/init-fixture.ts — same
     //     D3 carve-out (Phase 3 PD9).
     //   - docs/changes/init-design-roadmap-config/plans/ + /verification/ —
     //     historical paper trail; out of scope per Phase 2 verifier
     //     scope-note (15 residual matches there are intentional history).
     for (const filePath of [SKILL_MD, PROPOSAL_MD]) {
       const content = fs.readFileSync(filePath, 'utf-8');
       expect(content).not.toMatch(/not-sure/);
     }
   });
   ```

2. Run `npx vitest run packages/cli/tests/integration/skill-catalog-consistency.test.ts` and confirm **5/5 pass** (3 existing + D5 + D4).
3. Run the full Phase 4 integration suite to confirm no collateral damage:
   ```sh
   npx vitest run \
     packages/cli/tests/integration/init-design-roadmap-matrix.test.ts \
     packages/cli/tests/integration/init-design-roadmap-yes-yes-e2e.test.ts \
     packages/cli/tests/integration/skill-catalog-consistency.test.ts
   ```
   Confirm **12/12 pass** (6 matrix + 1 e2e + 5 consistency).
4. No commit yet.

### Task 5: IMP-1 — Restore byte-faithful roadmap summary in `_helpers/init-fixture.ts`

**Depends on:** Task 4 | **Files:** `packages/cli/tests/integration/_helpers/init-fixture.ts`

1. The helper currently writes the trimmed summary string `'Run harness-design-system to define palette, typography, and generate W3C DTCG tokens.'` at lines 77–78. Restore it to the longer pre-Phase-3 form that the e2e test fixture used before Phase 3's extraction (sourced from `git show 2f643454`).

   **Exact edit:** Use `Edit` with:
   - `old_string`:
     ```ts
             summary:
               'Run harness-design-system to define palette, typography, and generate W3C DTCG tokens.',
     ```
   - `new_string`:
     ```ts
             summary:
               'Run harness-design-system to define palette, typography, and generate W3C DTCG tokens. Deferred from project init — fires on first design-touching feature via on_new_feature.',
     ```

2. Re-run the matrix + e2e tests to confirm no test asserts on the summary string (both tests previously verified by Phase 3 to not assert on `summary`):
   ```sh
   npx vitest run \
     packages/cli/tests/integration/init-design-roadmap-matrix.test.ts \
     packages/cli/tests/integration/init-design-roadmap-yes-yes-e2e.test.ts
   ```
   Confirm 7/7 pass.
3. Re-run the consistency test to confirm the new D4/D5 asserts still pass (they don't read the helper, but rerun as a smoke check):
   ```sh
   npx vitest run packages/cli/tests/integration/skill-catalog-consistency.test.ts
   ```
   Confirm 5/5 pass.
4. No commit yet.

### Task 6: SUG-1 — Amend Helper Signature code block in polish proposal.md (sync → async)

**Depends on:** Task 5 | **Files:** `docs/changes/init-design-roadmap-polish/proposal.md`

1. The Helper Signature code block at lines 69–84 declares the helper as synchronous (`: InitFixtureHandle`) but the real Phase 3 implementation is `Promise<InitFixtureHandle>`. Correct the signature line and add a brief async-clarification to the adjacent prose.

   **Exact edit 1:** Use `Edit` with:
   - `old_string`:
     ```ts
     export function scaffoldInitFixture(scenario: InitFixtureScenario): InitFixtureHandle;
     ```
   - `new_string`:
     ```ts
     export async function scaffoldInitFixture(
       scenario: InitFixtureScenario
     ): Promise<InitFixtureHandle>;
     ```

2. Update the prose paragraph immediately below the code block (currently line 86) to acknowledge the async nature.

   **Exact edit 2:** Use `Edit` with:
   - `old_string`: `The helper produces post-step-5b config state and post-step-4 roadmap state given the scenario, matching what the matrix test inlines today. No mutation logic moves into the helper — it only writes the requested fixture.`
   - `new_string`: `The helper produces post-step-5b config state and post-step-4 roadmap state given the scenario, matching what the matrix test inlines today. The function is async because the Phase 3 implementation awaits `runInit({ cwd, name, level })`to scaffold the base project before mutating`harness.config.json`/`docs/roadmap.md`; callers must `await scaffoldInitFixture(...)`. No mutation logic moves into the helper — it only writes the requested fixture.`

3. No tests run on prose edits — proposal.md is not on any vitest path. Run `harness validate` to confirm exit=1, 290 issues — identical to Phase 3 baseline. Capture exit code and issue count for the commit message.
4. No commit yet.

### Task 7: Atomic commit (explicit `git add` of named files only)

**Depends on:** Task 6 | **Files:** git index only

1. Verify pre-commit working-tree state. Run `git status --short` and confirm:
   - **M** (will be staged): `packages/cli/tests/integration/skill-catalog-consistency.test.ts`
   - **M** (will be staged): `packages/cli/tests/integration/_helpers/init-fixture.ts`
   - **M** (will be staged): `docs/changes/init-design-roadmap-polish/proposal.md`
   - **M** (will NOT be staged, pre-existing carry-forward): `.harness/security/timeline.json`
   - **M** (will NOT be staged, pre-existing carry-forward): `.harness/specialization-profiles.json`
   - **M** (will NOT be staged, pre-existing carry-forward): `docs/roadmap.md`
   - **M** (will NOT be staged, pre-existing carry-forward): `packages/cli/.harness/arch/baselines.json`
   - **??** (will NOT be staged, untracked plan files): `docs/changes/init-design-roadmap-polish/plans/2026-06-03-phase{1,2,3,4}-*.md`
2. Stage **only** the three named files using explicit `git add`. **DO NOT** use `git add -A` or `git add .`:
   ```sh
   git add \
     packages/cli/tests/integration/skill-catalog-consistency.test.ts \
     packages/cli/tests/integration/_helpers/init-fixture.ts \
     docs/changes/init-design-roadmap-polish/proposal.md
   ```
3. Re-run `git status --short` and verify the staged section contains exactly those three paths (and no others).
4. Commit with the message below (single atomic commit, HEREDOC for fidelity):

   ```sh
   git commit -m "$(cat <<'EOF'
   test(init-design-roadmap-polish): vocabulary regression guards + docstring rewrite (FINAL-S3 + D4/D5)

   Phase 4 of init-design-roadmap-polish closes FINAL-S3 (docstring rewrite per
   D10) and adds the two D4/D5 vocabulary regression assertions to
   skill-catalog-consistency.test.ts. Also lands IMP-1 (helper roadmap summary
   restoration to byte-faithful pre-Phase-3 form) and SUG-1 (polish proposal
   Helper Signature amendment from sync to async, matching the real Phase 3
   implementation).

   skill-catalog-consistency.test.ts:
   - Top-of-file docstring rewritten: each assert (a/b/c — and new d/e) now
     cites the SPECIFIC regression it guards (per D10), not just what it
     asserts. Future readers see the history without diving into the
     init-design-roadmap-config carry-forward trail.
   - New `PROPOSAL_MD` constant points to init-design-roadmap-config/proposal.md
     (narrow scope per Phase 2 verifier scope-note). The polish proposal.md is
     intentionally excluded — it contains a code-fence TypeScript literal
     `'not-sure'` (InitFixtureScenario.design union; D3 technical-identifier
     carve-out).
   - New assertion (D5): forbids `Not sure yet` outside emit_interaction button
     labels via 32-char-left / 16-char-right window match against
     /label:\s*["']Not sure yet/. Both current occurrences in SKILL.md
     (lines 124, 169) sit inside `label:` strings and pass.
   - New assertion (D4 regression guard): forbids hyphenated `not-sure` in
     user-facing copy, scoped to [SKILL_MD, PROPOSAL_MD]. Scope explicitly
     excludes:
       * packages/cli/tests/integration/_helpers/init-fixture.ts (Phase 3 PD9
         carve-out — D3 technical identifier).
       * docs/changes/init-design-roadmap-polish/proposal.md (code-fence
         technical literal — D3 carve-out).
       * docs/changes/init-design-roadmap-config/plans/ + /verification/
         (historical paper trail; Phase 2 verifier scope-note — 15 residual
         hyphenated matches there are intentional history).

   _helpers/init-fixture.ts (IMP-1):
   - One-line restore: roadmap-feature summary string lengthened back to
     'Run harness-design-system to define palette, typography, and generate
     W3C DTCG tokens. Deferred from project init — fires on first
     design-touching feature via on_new_feature.' (byte-faithful with the
     pre-Phase-3 e2e fixture per `git show 2f643454`). Matrix + e2e tests
     do not assert on `summary`, so this is safe.

   docs/changes/init-design-roadmap-polish/proposal.md (SUG-1):
   - Helper Signature code block corrected: the falsified sync declaration
     (`: InitFixtureHandle`) replaced with the real async one
     (`Promise<InitFixtureHandle>`). Prose paragraph extended to document the
     async-ness (helper awaits `runInit(...)` before mutating fixtures;
     callers must `await scaffoldInitFixture(...)`).

   Verification:
   - npx vitest run packages/cli/tests/integration/skill-catalog-consistency.test.ts → 5/5 pass (3 existing + D5 + D4).
   - npx vitest run on matrix + e2e + consistency → 12/12 pass.
   - harness validate → exit=1, 290 issues (identical to Phase 3 baseline; no
     arch/design baseline perturbation from test additions + helper string
     lengthening + spec prose edit).
   - Only the 3 named files are staged; the four working-tree carry-forwards
     (.harness/security/timeline.json, .harness/specialization-profiles.json,
     docs/roadmap.md, packages/cli/.harness/arch/baselines.json) and the
     untracked Phase 1/2/3/4 plan files remain unstaged for Phase 5 disposition.

   Spec: docs/changes/init-design-roadmap-polish/proposal.md (FINAL-S3, D4, D5, D10).
   Plan: docs/changes/init-design-roadmap-polish/plans/2026-06-03-phase4-docstring-regression-guard-plan.md
   Predecessor: 4bbb93d3 (Phase 3, FINAL-S1 helper extraction).
   EOF
   )"
   ```

5. Capture the new commit SHA via `git rev-parse HEAD`.
6. Post-commit verification:
   - Run `git status --short` and confirm the four working-tree carry-forwards (`.harness/security/timeline.json`, `.harness/specialization-profiles.json`, `docs/roadmap.md`, `packages/cli/.harness/arch/baselines.json`) plus the four untracked plan files remain in the working tree (none were swept into the commit).
   - Run `git show --stat HEAD` and confirm the commit's file list contains exactly 3 paths: `packages/cli/tests/integration/skill-catalog-consistency.test.ts`, `packages/cli/tests/integration/_helpers/init-fixture.ts`, `docs/changes/init-design-roadmap-polish/proposal.md`.
   - Run `npx vitest run packages/cli/tests/integration/skill-catalog-consistency.test.ts packages/cli/tests/integration/init-design-roadmap-matrix.test.ts packages/cli/tests/integration/init-design-roadmap-yes-yes-e2e.test.ts` and confirm 12/12 pass.
   - Run `harness validate` and confirm exit=1, 290 issues — identical to Phase 3 baseline.

## Sequence Notes

- Tasks 1–4 are all reads/writes inside a single test file; they are sequenced because each builds on the prior task's structural state (Task 2 rewrites the docstring; Task 3 adds the `PROPOSAL_MD` constant + first new it block; Task 4 adds the second new it block). Cannot parallelize.
- Tasks 5 and 6 touch two different files (helper TS + polish proposal MD). They are sequenced after Task 4 to keep one mental thread per task, but they could be reordered between themselves with no behavioral effect. Order chosen: helper first (smaller, closer to the test concern), spec amendment second.
- Task 7 is the commit gate; depends on all prior tasks completing without error.

## Harness Integration

- **`harness validate`** baseline at Phase 3: exit=1, 290 issues. Phase 4 must preserve. Run after Task 6 (pre-commit) and after Task 7 (post-commit verification).
- **`harness check-deps`** — not required this phase; no new imports added to runtime code (test file imports `fs` and `path` which are already imported).
- **Plan commit** — Per harness-planning Phase 4 Step 8, this plan itself must be committed after writing. Since Phase 4 of this autopilot run already includes a 3-file implementation commit, the plan file should be committed **separately and first** (a `docs(init-design-roadmap-polish): add Phase 4 plan` commit), exactly mirroring how Phase 1, Phase 2, and Phase 3 plan files were each committed before their implementation commit. Autopilot may handle this between handoff and execution.
- **No checkpoints** — every task is mechanical (read, edit, run test, commit). 0 `[checkpoint:*]` markers.

## Success Criteria Tracing

| Observable Truth                                                | Task(s)       |
| --------------------------------------------------------------- | ------------- |
| 1. Docstring rewritten with regression motivation               | Task 2        |
| 2. `PROPOSAL_MD` constant added with narrow scope               | Task 3        |
| 3. D5 `Not sure yet` window-match assertion added               | Task 3        |
| 4. D4 hyphenated-`not-sure` narrow-scope assertion added        | Task 4        |
| 5. IMP-1 helper summary byte-restoration                        | Task 5        |
| 6. SUG-1 spec Helper Signature async amendment                  | Task 6        |
| 7. consistency.test.ts → 5/5 pass                               | Tasks 3, 4, 5 |
| 8. matrix + e2e + consistency → 12/12 pass                      | Tasks 4, 5, 7 |
| 9. `harness validate` exit=1, 290 issues — Phase 3 baseline     | Tasks 6, 7    |
| 10. Atomic commit with exactly 3 files; carry-forwards unstaged | Task 7        |

## Estimated Time

| Task | Description                                                     | Time       |
| ---- | --------------------------------------------------------------- | ---------- |
| 1    | Baseline snapshot + carry-forward inventory                     | 3 min      |
| 2    | Docstring rewrite (FINAL-S3 / D10)                              | 4 min      |
| 3    | `PROPOSAL_MD` constant + D5 assertion                           | 3 min      |
| 4    | D4 hyphenated-`not-sure` assertion + full integration suite run | 4 min      |
| 5    | IMP-1 helper summary restoration + reruns                       | 3 min      |
| 6    | SUG-1 spec amendment + `harness validate`                       | 2 min      |
| 7    | Atomic commit + post-commit verification                        | 3 min      |
| —    | **Total**                                                       | **22 min** |

## Gates Self-Check

- [x] No vague tasks — every task names exact files, exact text, exact commands.
- [x] No tasks larger than one context window — all 7 are 2–5 minutes.
- [x] No skipping TDD — applicable only to code-producing tasks. The new assertions (Tasks 3, 4) are themselves the tests; they are not stubbed for "later." The existing 3 asserts are preserved unchanged.
- [x] Plan starts with observable truths — 10 enumerated.
- [x] No implementation during planning — this plan only describes; execution is harness-execution's job.
- [x] File map complete — 3 modify paths enumerated.
- [x] Uncertainties surfaced — 3 assumptions + 1 deferrable listed.
