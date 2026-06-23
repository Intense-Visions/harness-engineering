# Plan: Phase 2 — Vocabulary Normalization (FINAL-S2)

**Date:** 2026-06-03
**Spec:** `docs/changes/init-design-roadmap-polish/proposal.md`
**Session:** `changes--init-design-roadmap-polish--proposal`
**Phase:** 2 of 5 (per spec Implementation Order)
**Tasks:** 4
**Time:** ~14 min
**Integration Tier:** small
**Predecessor:** Phase 1 single commit `cd16bd8b` (S2 + S3 doc/yaml fixes)

## Goal

Normalize all narrative occurrences of "Not sure yet" and hyphenated `not-sure` to the canonical lowercase two-word form `not sure` across `agents/skills/claude-code/initialize-harness-project/SKILL.md` and `docs/changes/init-design-roadmap-config/proposal.md`, while preserving the literal button-label strings `label: "Not sure yet"` verbatim. Landed in a single commit.

## Observable Truths (Acceptance Criteria)

These are derived directly from the spec's Success Criteria (Vocabulary subsection, items 5/6/7) scoped to the two files in scope for Phase 2:

1. **Ubiquitous.** The system shall have zero occurrences of the substring `Not sure yet` in `agents/skills/claude-code/initialize-harness-project/SKILL.md` outside of `emit_interaction` option `label:` strings. Verifiable by:
   `grep -n 'Not sure yet' agents/skills/claude-code/initialize-harness-project/SKILL.md` returns only the three known button-label lines (124, 169, and any structurally identical label-block line) and nothing else.
2. **Ubiquitous.** The system shall have zero occurrences of the hyphenated substring `not-sure` in `agents/skills/claude-code/initialize-harness-project/SKILL.md`. Verifiable by:
   `grep -n 'not-sure' agents/skills/claude-code/initialize-harness-project/SKILL.md` returns zero matches.
3. **Ubiquitous.** The system shall have zero occurrences of the hyphenated substring `not-sure` in `docs/changes/init-design-roadmap-config/proposal.md`. Verifiable by:
   `grep -n 'not-sure' docs/changes/init-design-roadmap-config/proposal.md` returns zero matches.
4. **Ubiquitous.** The system shall have zero occurrences of the substring `Not sure yet` in `docs/changes/init-design-roadmap-config/proposal.md` (this file has no legitimate button-label strings — every occurrence is narrative). Verifiable by:
   `grep -n 'Not sure yet' docs/changes/init-design-roadmap-config/proposal.md` returns zero matches.
5. **Ubiquitous.** The system shall preserve every existing `label: "Not sure yet"` line verbatim. Verifiable by:
   `grep -nE 'label:\s*"Not sure yet"' agents/skills/claude-code/initialize-harness-project/SKILL.md` returns the same set of matches as before the change (today: lines 124, 169 — two matches total).
6. **Ubiquitous.** The system shall have one new atomic commit on `main` whose only touched files are `agents/skills/claude-code/initialize-harness-project/SKILL.md` and `docs/changes/init-design-roadmap-config/proposal.md` (and any pre-commit-hook regenerated downstream artifacts, expected: none for vocabulary text changes).
7. **Ubiquitous.** The system shall pass `harness validate` after the commit with the same baseline issue count and category profile as Phase 1 left it (290 issues, exit 1, no new categories). No regression.
8. **Event-driven.** When the Phase 4 regression-guard assertions (`forbids "Not sure yet" outside emit_interaction button labels` and `forbids hyphenated "not-sure" in user-facing copy`) are eventually added, they shall pass against the post-Phase-2 file contents without further normalization edits.

## File Map

- MODIFY `agents/skills/claude-code/initialize-harness-project/SKILL.md` — narrative `Not sure yet` and `not-sure` substitutions; preserve `label: "Not sure yet"` button-label strings (lines 124, 169) verbatim.
- MODIFY `docs/changes/init-design-roadmap-config/proposal.md` — narrative `Not sure yet` and `not-sure` substitutions; this file has no button-label strings.

No new files. No deletions. No yaml or code changes.

## Edit Inventory (Pre-decomposed)

Each edit below is a targeted in-place substring substitution. Line numbers reflect the pre-edit file state (verified by `Grep` in the planning phase).

### `agents/skills/claude-code/initialize-harness-project/SKILL.md`

**PRESERVE verbatim (do NOT edit):**

- L124: `            label: "Not sure yet",`
- L169: `            label: "Not sure yet",`

**EDIT — narrative occurrences:**

| Line | Pre-edit substring                                                         | Post-edit substring                                                    |
| ---- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| L99  | `   - **Not sure yet:** Skip i18n configuration entirely.`                 | `   - **Not sure:** Skip i18n configuration entirely.`                 |
| L139 | `   - **Not sure yet:** Do not write`design.enabled`or`design.platforms`.` | `   - **Not sure:** Do not write`design.enabled`or`design.platforms`.` |
| L186 | `      - **Not sure yet:** no state write.`                                | `      - **Not sure:** no state write.`                                |
| L326 | `On "Not sure yet" no state is written;`                                   | `On "not sure" no state is written;`                                   |
| L343 | `or absent for not-sure.`                                                  | `or absent for not sure.`                                              |
| L344 | `Not sure yet → no `STRATEGY.md`and no`init.strategy.declined` flag.`      | `Not sure → no `STRATEGY.md`and no`init.strategy.declined` flag.`      |
| L359 | `Even a "No" or "Not sure yet" answer is better than no answer`            | `Even a "no" or "not sure" answer is better than no answer`            |
| L550 | `Phase 3 step 5c (strategy): "Not sure yet." → no STRATEGY.md`             | `Phase 3 step 5c (strategy): "not sure." → no STRATEGY.md`             |

**Rationale per case:**

- L99 / L139 / L186: bullet-label form `**Not sure yet:**` — drop "yet" to match the canonical two-word form. Sentence-case capital `N` is preserved because the bullet label is a sentence start (consistent with sibling bullets `**Yes:**` / `**No:**`). The D2 canon is "lowercase, two words, no hyphen"; the sentence-case capital `N` at a bullet/sentence start is grammatical English, not a vocabulary drift vector — it parallels existing `**Yes:**` / `**No:**` bullets which the canon does not force to lowercase either.
- L326 / L344 / L550: inline narrative or quoted user-answer text. Drop "yet"; use lowercase inside the quote where the line is rendering the literal answer the user picked (L326, L550). L344 preserves sentence-start capital `N` because it appears at the start of a clause in a `Yes → ... ; No → ... ; Not sure → ...` enumeration paralleling the existing capitalized `Yes` / `No` siblings.
- L343: hyphenated `not-sure` in plain prose → `not sure`. D3 explicitly forbids hyphenated form in user-facing copy and Success Criterion #6 enforces grep-zero on the hyphenated substring across `agents/skills/claude-code/initialize-harness-project/SKILL.md`. (The S2 spec's grep clause is scoped to `docs/changes/init-design-roadmap-config/` and `SKILL.md`; SKILL.md is in scope.)
- L359: paired `"No" or "Not sure yet"` quoted-answer literals. Lowercase both to match the canonical lowercase form when rendering the literal answer; the surrounding rationalization-row tone treats these as user-uttered strings, where lowercase canonical form is appropriate.

### `docs/changes/init-design-roadmap-config/proposal.md`

**EDIT — all occurrences are narrative (no button labels in this file):**

| Line | Pre-edit substring                                                              | Post-edit substring                                                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L37  | `Three-way response for design question: `yes`/`no`/`not-sure`` (header cell)   | `Three-way response for design question: `yes`/`no`/`not sure``(drop hyphen, drop backticks on`not sure` only)                                                                                     |
| L37  | `not-sure` skips silently — can be enabled later.` (rationale cell)             | `not sure` skips silently — can be enabled later.`(drop hyphen, drop backticks on`not sure` only)                                                                                                  |
| L65  | `> - **Not sure:** Do not set `design.enabled`.`                                | `> - **Not sure:** Do not set `design.enabled`.` (no change — already canonical two-word form; sentence-case `N` is bullet-start English and parallels `**Yes:**` / `**No:**` siblings on L63/L64) |
| L167 | `three structured options (yes/no/not-sure) via `emit_interaction`.`            | `three structured options (yes/no/not sure) via `emit_interaction`.`                                                                                                                               |
| L171 | `5. The linked roadmap item does NOT appear when either answer is no/not-sure.` | `5. The linked roadmap item does NOT appear when either answer is no/not sure.`                                                                                                                    |

**Rationale per case:**

- L37 (both cells): The spec explicitly says "normalize ... to canonical `not sure` in narrative prose **and the D3 decision row**" (Files Modified table, row 1). The backticks around `not-sure` previously framed it as a code/identifier shape; once stripped of the hyphen, the term becomes plain prose and the backticks are dropped to match. The sibling backticked tokens `` `yes` `` and `` `no` `` are retained in the header cell because they remain genuine identifier-shaped enum value references (matched against `'yes'` / `'no'` literals in the helper signature L72 of this same file); only the `not-sure` → `not sure` transformation collapses the identifier shape into prose, requiring the backtick removal on that token alone. **One narrow exception is preserved by design:** the helper signature on L72 (`design: 'yes' | 'no' | 'not-sure';`) is a TypeScript type literal embedded in a code fence and remains untouched in Phase 2 — that string is a code-level enum value, not user-facing copy. (See "Uncertainty resolution" below for the L72 disposition.)
- L65: already in canonical two-word form (`**Not sure:**`); leave verbatim. Verified by grep: this line does not match `Not sure yet` and does not match `not-sure`. Both observable truths (#3, #4) pass on this line without an edit.
- L167 / L171: hyphenated `not-sure` in plain prose listing user-facing option values. D3 forbids hyphenation; Success Criterion #6 enforces zero hyphenated matches in `docs/changes/init-design-roadmap-config/`. Replace.

### Uncertainty resolution: helper signature L72

The proposal contains, inside a TypeScript code fence at L72:

```ts
design: 'yes' | 'no' | 'not-sure';
```

[ASSUMPTION] This is a **code-level enum value** (a TypeScript string-literal union type the matrix test uses as fixture input), not user-facing prose. Per D3 (`not-sure` "survives only as a config key or technical identifier"), this is the exact case D3 carves out. **Phase 2 leaves L72 untouched.**

**Risk if assumption is wrong:** Success Criterion #6 reads "Grep for `not-sure` (hyphenated) across `docs/changes/init-design-roadmap-config/` ... returns zero matches." A strict grep against the directory will hit L72 and fail. **Mitigation:** Task 1 runs the grep up-front to confirm whether L72 is the only remaining match after the narrative edits. If it is, escalate to the user with a one-sentence question: "L72 of proposal.md is a TypeScript type-literal `'not-sure'` inside a code fence. Per D3 this is a technical identifier and should survive, but Success Criterion #6 reads literally as zero matches across the whole directory. Treat L72 as: (a) preserved (D3 wins), (b) renamed to `'not sure'` (criterion #6 wins, breaks the matrix test fixture mapping), or (c) renamed to `'notSure'` (criterion #6 wins, cleaner identifier)?" Default behavior on no response: (a) preserved. This question is deferred to Phase 2 execution because resolving it pre-emptively in planning would require either a code change (Phase 3 territory) or a spec amendment (out of Phase 2 scope).

## Tasks

### Task 1: Audit grep — baseline the pre-edit state

**Depends on:** none | **Files:** read-only sweep of `agents/skills/claude-code/initialize-harness-project/SKILL.md` and `docs/changes/init-design-roadmap-config/proposal.md`

This task captures the pre-edit grep baseline so the executor can verify each subsequent edit produces the predicted line-delta. No file modifications.

1. Run from repo root:
   ```bash
   grep -nE '[Nn]ot[ -]?[Ss]ure' agents/skills/claude-code/initialize-harness-project/SKILL.md
   grep -nE '[Nn]ot[ -]?[Ss]ure' docs/changes/init-design-roadmap-config/proposal.md
   ```
2. Confirm the SKILL.md output contains exactly the lines enumerated in the SKILL.md edit table above (L99, L124, L139, L169, L186, L326, L343, L344, L359, L550) plus zero unexpected hits.
3. Confirm the proposal.md output contains exactly L37 (twice — header + rationale cell), L65, L72 (helper signature, inside code fence), L167, L171, L177 plus zero unexpected hits. L65 and L177 are already canonical and require no edit; L72 is the deferred technical-identifier case (see Uncertainty resolution above).
4. If either grep returns an unexpected line, STOP and surface the diff before any edit lands. Do not silently fold a newly discovered occurrence into Task 2 or 3 without acknowledging it in the commit message.
5. Run: `harness validate > /tmp/phase2-validate-pre.log 2>&1; echo "exit=$?"` to capture the pre-edit baseline. Expected: `exit=1`, ~290 issues (same as Phase 1 handoff documented).
6. No commit. No staging. Read-only audit.

**Acceptance:** The grep outputs match the Edit Inventory tables 1:1 (no missing lines, no extra lines), and the harness validate baseline is recorded for later comparison.

### Task 2: Edit SKILL.md — narrative vocabulary normalization

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`

Apply the eight edits enumerated in the SKILL.md edit table (L99, L139, L186, L326, L343, L344, L359, L550). Preserve L124 and L169 (the `label: "Not sure yet"` button strings) verbatim.

1. For each row in the SKILL.md edit table above, apply the substring replacement using a single targeted edit per line. Use the line's surrounding ~1-line context to keep each edit unique within the file. Specifically:
   - **L99:** Replace `  - **Not sure yet:** Skip i18n configuration entirely. Do not set`i18n.enabled`. The project can enable i18n later by running `harness-i18n-workflow` directly.` → `  - **Not sure:** Skip i18n configuration entirely. Do not set`i18n.enabled`. The project can enable i18n later by running `harness-i18n-workflow` directly.`
   - **L139:** Replace `   - **Not sure yet:** Do not write`design.enabled`or`design.platforms`. The project can enable design later by running `harness-design-system`directly;`on_new_feature` will prompt gently when a feature touches user-facing UI.` → `   - **Not sure:** Do not write`design.enabled`or`design.platforms`. The project can enable design later by running `harness-design-system`directly;`on_new_feature` will prompt gently when a feature touches user-facing UI.`
   - **L186:** Replace `     - **Not sure yet:** no state write.`/harness:strategy` remains available standalone, and a future re-run of init will re-offer.` → `     - **Not sure:** no state write.`/harness:strategy` remains available standalone, and a future re-run of init will re-offer.`
   - **L326:** Replace `On "Not sure yet" no state is written;` → `On "not sure" no state is written;`
   - **L343:** Replace `or absent for not-sure.` → `or absent for not sure.`
   - **L344:** Replace `Not sure yet → no `STRATEGY.md`and no`init.strategy.declined` flag.` → `Not sure → no `STRATEGY.md`and no`init.strategy.declined` flag.`
   - **L359:** Replace `Even a "No" or "Not sure yet" answer is better than no answer` → `Even a "no" or "not sure" answer is better than no answer`
   - **L550:** Replace `Phase 3 step 5c (strategy): "Not sure yet." → no STRATEGY.md, no init.strategy.declined flag; user can run /harness:strategy later.` → `Phase 3 step 5c (strategy): "not sure." → no STRATEGY.md, no init.strategy.declined flag; user can run /harness:strategy later.`
2. After all eight edits land, run the audit grep again:
   ```bash
   grep -nE '[Nn]ot[ -]?[Ss]ure' agents/skills/claude-code/initialize-harness-project/SKILL.md
   ```
   Expected output:
   - Lines 99, 139, 186 now read `**Not sure:**` (no "yet").
   - Lines 124, 169 still read `label: "Not sure yet",` verbatim (unchanged).
   - Line 326 now reads `On "not sure"`.
   - Line 343 now reads `or absent for not sure.` (no hyphen).
   - Line 344 now reads `Not sure → no STRATEGY.md`.
   - Line 359 now reads `Even a "no" or "not sure"`.
   - Line 550 now reads `(strategy): "not sure."`.
   - Zero lines match `not-sure` (hyphenated).
   - Exactly two lines match `Not sure yet` (L124, L169 — both inside `label:`).
3. Do NOT commit yet. Task 4 is the single-commit gate.
4. No `harness validate` yet; final validate runs in Task 4.

**Acceptance:** Observable truths #1, #2, and #5 (preservation of `label:` strings) pass against SKILL.md.

### Task 3: Edit proposal.md — narrative vocabulary normalization

**Depends on:** Task 2 | **Files:** `docs/changes/init-design-roadmap-config/proposal.md`

Apply the five narrative edits enumerated in the proposal.md edit table (L37 ×2, L167, L171). L65 needs no edit (already canonical). L72 (helper signature inside a code fence) is deferred per the Uncertainty resolution and remains untouched in Phase 2.

1. Apply the substring replacements:
   - **L37 (header cell):** Replace `Three-way response for design question: `yes`/`no`/`not-sure`` → `Three-way response for design question: `yes` / `no` / `not sure`` (note: only the `not-sure` token loses its backticks; `yes` and `no` retain theirs because they remain identifier-shaped enum values).
   - **L37 (rationale cell):** Replace ``no` records a permanent decline (no future nudges). `not-sure` skips silently — can be enabled later.` → ``no`records a permanent decline (no future nudges).`not sure` skips silently — can be enabled later.` — wait: this leaves `not sure` inside backticks. Re-resolve: drop the backticks on the prose token. Final form: ``no` records a permanent decline (no future nudges). `not sure` skips silently — can be enabled later.` → ``no` records a permanent decline (no future nudges). not sure skips silently — can be enabled later.`. Use this latter form (no backticks on the prose token).
   - **L167:** Replace `three structured options (yes/no/not-sure) via `emit_interaction`.` → `three structured options (yes/no/not sure) via `emit_interaction`.`
   - **L171:** Replace `5. The linked roadmap item does NOT appear when either answer is no/not-sure.` → `5. The linked roadmap item does NOT appear when either answer is no/not sure.`
2. **DO NOT edit L72.** Verify the line still reads `  design: 'yes' | 'no' | 'not-sure';` inside the code fence after all other edits land. This is the deferred technical-identifier case.
3. Run the audit grep:
   ```bash
   grep -nE '[Nn]ot[ -]?[Ss]ure' docs/changes/init-design-roadmap-config/proposal.md
   ```
   Expected output:
   - L37 header cell now reads `... / `no`/`not sure`` (no hyphen).
   - L37 rationale cell now reads `... not sure skips silently ...` (no hyphen, no backticks on the prose token).
   - L65 unchanged: `**Not sure:**`.
   - L72 unchanged: `'not-sure'` inside the code fence (the single remaining hyphenated match).
   - L167 now reads `(yes/no/not sure)`.
   - L171 now reads `no/not sure`.
   - L177 unchanged: `"not sure"`.
   - Zero lines match `Not sure yet`.
4. **L72 escalation check.** If grep against the file reports only L72 as the residual `not-sure` match, run the planned escalation question (see Uncertainty resolution above) before proceeding to Task 4. Default disposition on no response: preserve L72 and proceed. Surface the residual L72 hit explicitly in the commit body so reviewers see it acknowledged, not silently shipped.
5. Do NOT commit yet. Task 4 is the single-commit gate.

**Acceptance:** Observable truths #3 (modulo the L72 caveat resolution) and #4 pass against proposal.md.

### Task 4: harness validate + single atomic commit

**Depends on:** Task 3 | **Files:** stages only the two files modified in Tasks 2-3; commits

This is the spec's "Single commit" gate for Phase 2.

1. Run a final audit grep across both files combined, sanity-check against observable truths #1-#5:
   ```bash
   grep -nE '[Nn]ot[ -]?[Ss]ure' agents/skills/claude-code/initialize-harness-project/SKILL.md docs/changes/init-design-roadmap-config/proposal.md
   ```
2. Run: `harness validate > /tmp/phase2-validate-post.log 2>&1; echo "exit=$?"`. Expected: `exit=1`, ~290 issues, same categories as the Task 1 baseline. If the issue count or category profile changes, STOP and diagnose before committing — vocabulary text edits should not regress validation.
3. Stage ONLY the two files modified in this phase:
   ```bash
   git add agents/skills/claude-code/initialize-harness-project/SKILL.md docs/changes/init-design-roadmap-config/proposal.md
   ```
   **Do not** use `git add -A` or `git add .` — the three pre-existing unrelated working-tree modifications (`.harness/specialization-profiles.json`, `docs/roadmap.md`, `packages/cli/.harness/arch/baselines.json`) carried forward from Phase 1 MUST stay unstaged. Verify with `git status` before committing.
4. Verify staged diff:
   ```bash
   git diff --cached --stat
   ```
   Expected: exactly 2 files changed. No `.gemini-extension/` artifact regeneration is expected for vocabulary-only text edits (unlike Phase 1's depends_on change), but if the pre-commit hook does stage one, accept it the same way Phase 1 did — auto-stage is legitimate downstream artifact mirroring, not a leak.
5. Commit:

   ```bash
   git commit -m "$(cat <<'EOF'
   docs(init-design-roadmap-polish): normalize "not sure" vocabulary (FINAL-S2)

   Sweeps initialize-harness-project/SKILL.md and init-design-roadmap-config/proposal.md
   for narrative occurrences of "Not sure yet" and hyphenated "not-sure", replacing both
   with the canonical lowercase two-word form "not sure". Preserves the literal
   `label: "Not sure yet"` button strings at SKILL.md:124 and SKILL.md:169 verbatim
   per D2/D5 of the polish spec.

   - SKILL.md: 8 narrative edits (L99, L139, L186, L326, L343, L344, L359, L550); 2 button labels preserved (L124, L169).
   - proposal.md: 5 narrative edits (L37 ×2, L167, L171); L65 already canonical; L72 helper signature `'not-sure'` preserved inside code fence as a TypeScript enum value (technical identifier per D3, deferred for Phase 3 disposition).
   - harness validate: 290 issues, exit 1 (same baseline as Phase 1; no regression).
   - Spec: docs/changes/init-design-roadmap-polish/proposal.md (FINAL-S2).
   EOF
   )"
   ```

6. Verify the commit landed and the working tree state is correct:
   ```bash
   git log -1 --stat
   git status
   ```
   Expected: HEAD is the new vocab-normalization commit, touching exactly 2 files (or 2 + 1 regen artifact, matching Phase 1's pattern). The three pre-existing unrelated modifications (`.harness/specialization-profiles.json`, `docs/roadmap.md`, `packages/cli/.harness/arch/baselines.json`) remain in the unstaged working tree.
7. Final `harness validate > /tmp/phase2-validate-final.log 2>&1; echo "exit=$?"` — same baseline confirmed.
8. Run: `harness validate` one more time as the documented final gate (output stream is fine; the redirected logs from steps 2 and 7 are for diffing).

**Acceptance:** Observable truths #6 (single atomic commit, scoped staging) and #7 (harness validate parity with Phase 1 baseline) pass. Phase 2 complete.

## Sequencing & Dependencies

- Task 1 → Task 2 → Task 3 → Task 4 (strictly serial). No parallelism: Tasks 2 and 3 touch different files but both feed the same single-commit gate (Task 4); decoupling them gains nothing and risks staging-order mistakes. Task 1's grep baseline is the reference both edit tasks check against.
- Total estimate: ~14 min (Task 1: ~3 min audit + baseline; Task 2: ~4 min for 8 line-edits + post-grep; Task 3: ~3 min for 5 line-edits + post-grep + L72 escalation gate; Task 4: ~4 min for validate + scoped-stage + commit + post-commit verification).

## Concerns

- **[CONTINUING from Phase 1] Working-tree cleanliness.** Three pre-existing unrelated modifications remain in the working tree from before Phase 1 landed: `.harness/specialization-profiles.json`, `docs/roadmap.md`, `packages/cli/.harness/arch/baselines.json`. Phase 1 correctly excluded them via explicit `git add` of only its target files. Phase 2 MUST do the same. Task 4 step 3 enforces this with explicit `git add <file> <file>` rather than `git add -A`.
- **[CONTINUING from Phase 1] `harness validate` baseline = 290 issues, exit 1.** Pre-existing design-token warnings dominate the issue list (e.g., `Hardcoded color "#3b82f6"` in test fixtures, `Font-family "Geist"`). The Phase 1 handoff documented this as carry-forward noise; the practical Phase 2 gate is "no regression from baseline issue count or category," not literal "exit 0". Vocabulary text edits should not move the needle on either count or category — if they do, STOP.
- **[DEFER from Phase 1 reviewer note] proposal.md:145 stale architectural fact.** The Phase 1 reviewer flagged that proposal.md:145 (`agents/skills/claude-code/initialize-harness-project/skill.yaml `depends_on`should add`harness-design-system`(currently lists only`initialize-test-suite-project`)`) is stale — it describes the pre-Phase-1 state of `depends_on` (now post-Phase-1 the list includes `harness-design-system` AND `harness-roadmap`). This is **not** a "not sure" vocabulary issue; it is a stale architectural fact in an already-shipped doc. The Phase 1 reviewer correctly flagged it as out-of-scope for FINAL-S2. Surface it here so it does not get lost: **[DEFER]** proposal.md:145 staleness is out of scope for Phase 2; route to a follow-up doc-fix (likely a Phase 5 or post-Phase-5 cleanup commit).
- **[NEW Phase 2 uncertainty]** proposal.md:L72 contains a TypeScript type-literal `'not-sure'` inside a code fence (`design: 'yes' | 'no' | 'not-sure';`). Per D3 this is a code-level technical identifier and should survive narrative normalization. Per Success Criterion #6, a strict grep against the directory should return zero hyphenated matches. Phase 2 default: preserve L72, surface the L72 residual in the commit body, and defer the disposition decision (preserve / rename to `'not sure'` / rename to `'notSure'`) to Phase 3 (helper extraction) or to user clarification during Task 3 execution. The matrix test fixture also depends on this string identity, so any rename here cascades into Phase 3 work — best handled there.

## Decisions

| #   | Decision                                                                                                                                                                                           | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PD1 | Preserve sentence-case capital `N` at bullet-start and sentence-start narrative occurrences (e.g., `**Not sure:**`, `Not sure → no STRATEGY.md`, `On "not sure"` quoted-answer-literal lowercase). | D2 says "lowercase, two words, no hyphen". Strict lowercase at sentence-start would produce ungrammatical English (`**not sure:**`) and visibly diverge from sibling bullets `**Yes:**` / `**No:**` — neither of which the parent spec forces to lowercase. The canon's intent is to kill the trailing "yet" and the hyphen, not to override English sentence-case rules. Sentence-case capital `N` survives where grammatically required. |
| PD2 | Preserve proposal.md L72 (`'not-sure'` TypeScript type literal inside a code fence) untouched in Phase 2.                                                                                          | Per D3, hyphenated `not-sure` survives "only as a config key or technical identifier". L72 is exactly that case — a TypeScript string-literal union type. Renaming it cascades into the matrix test fixture mapping (Phase 3) and is best handled there. Phase 2 surfaces the residual in the commit body to avoid silent ship.                                                                                                            |
| PD3 | Strip the backticks from `` `not-sure` `` → `not sure` (no backticks) on proposal.md L37 narrative cells. Keep `` `yes` `` and `` `no` `` backticked in the same cells.                            | Once the hyphen is dropped and the term becomes two-word prose, the identifier-shape framing the backticks provided no longer applies. `yes` and `no` remain identifier-shaped enum values and keep their backticks. This asymmetry is intentional and matches D3's drift-vector reasoning ("the hyphen reads as an identifier shape").                                                                                                    |
| PD4 | Single atomic commit at the end (Task 4), not per-file commits.                                                                                                                                    | Spec's Implementation Order Phase 2 line: "Single commit." Match it.                                                                                                                                                                                                                                                                                                                                                                       |
| PD5 | Stage with explicit `git add <file1> <file2>`, never `git add -A`.                                                                                                                                 | Phase 1 set this precedent and the handoff documented the three pre-existing unrelated working-tree modifications that MUST stay unstaged. Carry the constraint forward.                                                                                                                                                                                                                                                                   |

## Skeleton

_Not produced — task count (4) is below the standard-rigor threshold (8). Per the rigor table, skeleton pass is skipped at this size in standard mode._

## Skill Annotations

No `docs/changes/init-design-roadmap-polish/SKILLS.md` exists. This is a pure documentation-text-edit phase with no design, framework, or architectural skill overlap to annotate. Skipping annotation. (Note: this is a documentation gap, not a planning gap — the advisor was not run for this spec.)

## Phase 2 Predecessor & Successor

- **Predecessor:** Phase 1 commit `cd16bd8b` (S2 + S3 doc/yaml fixes). Phase 2 builds on the post-Phase-1 working tree state.
- **Successor:** Phase 3 (FINAL-S1 helper extraction) — creates `packages/cli/tests/integration/_helpers/init-fixture.ts` and rewires the matrix + e2e tests. Phase 3 will need to make a decision on the L72 disposition surfaced as a Phase 2 concern.

## Harness Integration

- `harness validate` runs in Task 1 (baseline), Task 4 step 2 (pre-commit), Task 4 step 7 (post-commit verification), and Task 4 step 8 (final documented gate).
- No `harness check-deps` needed — no imports, no module structure change, no symbol moves.
- Plan committed immediately after writing (per the planning skill's Phase 4 step 8).
- Handoff written to `.harness/sessions/changes--init-design-roadmap-polish--proposal/handoff.json`.
- No `emit_interaction` needed during planning — the L72 escalation is a Task 3 execution-time gate, not a planning-time gate.
