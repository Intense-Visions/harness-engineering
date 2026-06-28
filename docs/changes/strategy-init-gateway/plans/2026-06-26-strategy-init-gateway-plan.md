# Plan: Promote the strategic anchor to a gateway position in init (Phase 0: GROUND)

**Date:** 2026-06-26 | **Spec:** `docs/changes/strategy-init-gateway/proposal.md` | **Tasks:** 6 | **Time:** ~24 min | **Integration Tier:** small

## Goal

Relocate the `STRATEGY.md` capture prompt out of `Phase 3: CONFIGURE` step 5c into a new
`Phase 0: GROUND` that runs first in the `initialize-harness-project` skill, deferring only the
`init.strategy.declined` flag write to a new post-SCAFFOLD step, and propagate the change byte-identically
across all four platform mirrors with regenerated plugin artifacts.

## Scope note (TDD exemption)

This is a documentation-only change to a single skill's procedure file (markdown) and its three byte-identical
mirrors plus generated plugin wrappers. There is no executable code and no test file. The harness-planning TDD
rule does not apply; each code-producing-equivalent task instead carries explicit **verification steps** (grep,
`diff`, drift-check, `harness validate`) that play the role of the test.

## Observable Truths (Acceptance Criteria)

Mapped to the spec's 9 success criteria (SC#):

1. **(SC1)** `agents/skills/claude-code/initialize-harness-project/SKILL.md` contains a
   `### Phase 0: GROUND — Capture the Strategic Anchor` heading positioned **before** `### Phase 1: ASSESS`,
   and `### Phase 3: CONFIGURE` no longer contains a STRATEGY.md **capture** step (old step 5c gone).
2. **(SC2)** The relocated section preserves all three branches (absent → prompt, present-valid → skip
   silently, present-invalid → offer three repair paths) and the `init.strategy.declined` meaning is unchanged.
3. **(SC3)** Phase 0 documents the three guard clauses: runs for all project shapes incl. test suites;
   migration handled via present-valid/present-invalid branches (distinct from `.harness/`-based ASSESS
   classification); No/Not-sure proceeds immediately to ASSESS and never blocks.
4. **(SC4)** All four platform mirrors (`claude-code`, `cursor`, `codex`, `gemini-cli`) are byte-identical
   — `diff` reports no differences.
5. **(SC5)** Generated plugin command artifacts (`.claude-plugin/commands/initialize-project.md`,
   `.cursor-plugin/commands/initialize-project.md`) are regenerated and match — `git status` shows no
   uncommitted drift after running the generator.
6. **(SC6)** `harness validate` passes (modulo the two pre-existing circular-dependency findings and the
   pre-existing design-token warnings unrelated to this change).
7. **(SC7)** `grep -in '5c'` against the edited `SKILL.md` returns zero matches for any
   `5c` / `step 5c` / `Phase 3 step 5c` string.
8. **(SC8)** `init.strategy.declined` is persisted only in `Phase 3: CONFIGURE` (after `.harness/` exists),
   never in Phase 0 — the Phase 0 body explicitly defers the write.
9. **(SC9)** Phase 0 uses a plain-text prompt (no `emit_interaction` block) and references the
   `write_strategy` / `validate_strategy` MCP tools for doc validation, with no project-level `harness validate`.

## File Map

- MODIFY `agents/skills/claude-code/initialize-harness-project/SKILL.md` (source of truth — all logic edits)
- MODIFY `agents/skills/cursor/initialize-harness-project/SKILL.md` (mirror)
- MODIFY `agents/skills/codex/initialize-harness-project/SKILL.md` (mirror)
- MODIFY `agents/skills/gemini-cli/initialize-harness-project/SKILL.md` (mirror)
- MODIFY (regenerate) `.claude-plugin/commands/initialize-project.md`
- MODIFY (regenerate) `.cursor-plugin/commands/initialize-project.md`
- MODIFY (regenerate, only if generator emits them) gemini/codex plugin command outputs

> **No `.claude-plugin/agents/` copy exists for this skill.** The plugin command wrapper references
> `@agents/skills/claude-code/initialize-harness-project/SKILL.md` by path (it does not inline the body), and
> `initialize-harness-project` is a slash command, not a persona subagent. The "any `.claude-plugin/agents/` copy"
> mentioned in the prompt does not exist here — `find .claude-plugin/agents -iname '*initialize*'` returns nothing.
> Because the wrapper references the SKILL by path, regeneration is expected to be a **no-op**; the task still runs
> the generator and proves zero drift (SC5).

## Skeleton

_Not produced — task count (6) is below the standard-mode threshold (8)._

## Prerequisite

`pnpm install && pnpm turbo build` must be complete before Task 5 (the plugin generator spawns the built CLI's
`generate-slash-commands`). `packages/cli/dist/index.js` was already present at planning time; if a concurrent
worktree reset wipes `dist/`, re-run `pnpm turbo build` before Task 5.

## Working directory

All commands run from the worktree root:
`/Users/cwarner/Projects/iv/harness-engineering/.claude/worktrees/brainstorm+strategy-init-gateway`.
Operate ONLY in this worktree. Do not `cd` into the main repo.

---

## Tasks

### Task 1: Insert `Phase 0: GROUND` before `Phase 1: ASSESS` (claude-code SKILL.md)

**Depends on:** none | **Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`

1. In `agents/skills/claude-code/initialize-harness-project/SKILL.md`, locate the line
   `### Phase 1: ASSESS — Determine Current State` (currently line 34). Insert the following block
   **immediately before** that heading (leave one blank line between the new block and the ASSESS heading):

   ```markdown
   ### Phase 0: GROUND — Capture the Strategic Anchor

   Run this before anything else — it is the first thing init does and the first question it asks the human.
   Offer to capture `STRATEGY.md`, the durable upstream product anchor read by `harness-brainstorming`,
   `harness-ideate`, and `harness-roadmap-pilot`. _Think first (strategy), build second (scaffold)._

   Before prompting, check whether `STRATEGY.md` already exists at repo root. Three cases:

   - **Absent (most common on init).** Ask the human in plain text (do **not** use an `emit_interaction` block —
     `SKILL.md` already mandates plain-text prompts for this skill):

     > Capture strategic anchor (STRATEGY.md) now? It grounds brainstorm / ideate / roadmap-pilot in
     > product-level context and is durable across milestones (a peer of `README.md`). The interview takes
     > 10-20 minutes.
     >
     > - **Yes** — run the strategy interview now.
     > - **No** — this project does not need a strategy doc (recorded as a permanent decline; init will not
     >   re-offer on rerun).
     > - **Not sure** — defer; `/harness:strategy` stays available and a future init re-offers.

     Apply the answer:
     - **Yes:** delegate to `harness-strategy` (which routes via its own Phase 0 to the first-run interview).
       It writes a valid `STRATEGY.md` at repo root, doc-validated via the `write_strategy` / `validate_strategy`
       MCP tools. Do **not** run a project-level `harness validate` here — `harness.config.json` does not exist
       until SCAFFOLD. When `harness-strategy` completes, proceed to Phase 1.
     - **No:** record the decline in working memory. `Phase 3: CONFIGURE` step 0 persists
       `init.strategy.declined: true` to `.harness/state.json` after SCAFFOLD creates it. Do **not** touch
       `.harness/` here — it does not exist yet.
     - **Not sure:** record nothing. `/harness:strategy` remains available standalone, and a future re-run of
       init will re-offer.

   - **Present and valid.** Skip the prompt silently. Surface a one-line note:
     `STRATEGY.md detected — downstream skills will pick it up as grounding`. No decline is recorded.

   - **Present but invalid.** Surface the validation error via the `validate_strategy` MCP tool (the MCP server
     already has `@harness-engineering/core` loaded, so this resolves even for plugin-only adopters with no
     `node_modules`). Offer three paths (mirror `harness-strategy` Phase 0):
     - **a) Fix now via `/harness:strategy` update** → delegate to `harness-strategy` with the broken section
       pre-selected.
     - **b) Move file to `STRATEGY.md.bak.<YYYY-MM-DD-HHmm>` and run a fresh interview** → rename, then delegate
       to `harness-strategy` Phase 1.
     - **c) Ignore for this init and proceed** → record the decline (persisted in `Phase 3: CONFIGURE` step 0)
       and continue. Init does NOT block on a present-but-invalid `STRATEGY.md`.

   **Guards:**

   - Phase 0 runs for **all** project shapes, including test suites — strategy is offered before the Phase 1
     step 5 test-suite classification and the step-6 dispatch, identical in reach to the legacy step.
   - A present-valid (skip) or present-invalid (offer fix) `STRATEGY.md` is the migration path for an existing
     strategy doc — distinct from the `.harness/`-based adoption-level classification in `Phase 1: ASSESS`,
     which Phase 0 must not pre-empt.
   - **No / Not-sure proceeds immediately into `Phase 1: ASSESS`. Phase 0 never blocks init.**

   This mirrors the ask-once-record-the-answer pattern also used by the i18n and design-system prompts in Phase 3.
   ```

2. Verify the heading order and absence of an `emit_interaction` block in the new section:

   ```bash
   grep -n '^### Phase' agents/skills/claude-code/initialize-harness-project/SKILL.md
   # Expect: "### Phase 0: GROUND ..." appears immediately before "### Phase 1: ASSESS ..."
   awk '/### Phase 0: GROUND/{f=1} /### Phase 1: ASSESS/{f=0} f' \
     agents/skills/claude-code/initialize-harness-project/SKILL.md | grep -c 'emit_interaction'
   # Expect: 0
   ```

3. Run: `harness validate` (expect pass modulo the documented pre-existing findings).
4. Commit: `docs(strategy-init-gateway): add Phase 0 GROUND to initialize-harness-project`

### Task 2: Add Phase 3 step 0 (persist decline) and remove old step 5c (claude-code SKILL.md)

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`

1. Under `### Phase 3: CONFIGURE — Customize for the Project`, insert a new step **before** the current
   `1. **Configure personas.**` line, numbered `0.` (so i18n step 5 and design-system step 5b do not renumber):

   ```markdown
   0. **Persist the Phase 0 grounding decision.** SCAFFOLD has now created `.harness/`. If the user **declined**
      the strategic anchor in `Phase 0: GROUND` (answered "No", or chose "ignore" on a present-but-invalid
      `STRATEGY.md`), write `init.strategy.declined: true` to `.harness/state.json` (merge into existing JSON;
      do not clobber). If the user answered "Yes" or "Not sure" in Phase 0, write nothing. This is the deferred
      half of the Phase 0 offer: Phase 0 captures the answer, this step records the decline once `.harness/`
      exists — so the relocation never fabricates `.harness/` early and never misclassifies a new project as a
      migration in `Phase 1: ASSESS`.
   ```

2. Remove the entire old **step 5c** block (currently `SKILL.md:145-197`): from the line
   `5c. **Capture strategic anchor (all levels).** Offer a three-way prompt for ` through and including the
   trailing line `    Mirror the i18n / design-system pattern: ask once, record the answer, never silently skip.`
   (and its surrounding blank lines). Step 5b ends and step 6 (`6. **Test-suite projects only...`) must now
   directly follow the design-system step with no 5c in between.

3. Verify:

   ```bash
   grep -n '5c' agents/skills/claude-code/initialize-harness-project/SKILL.md
   # Expect: only the in-body cross-references remain (handled in Task 3); the step-5c block is gone.
   grep -n '^0\. \*\*Persist the Phase 0 grounding decision' \
     agents/skills/claude-code/initialize-harness-project/SKILL.md
   # Expect: one match, inside Phase 3: CONFIGURE.
   grep -n 'emit_interaction' agents/skills/claude-code/initialize-harness-project/SKILL.md
   # Expect: only the design-system (5b) and roadmap (Phase 6) blocks remain; the strategy block is gone.
   ```

4. Run: `harness validate`.
5. Commit: `docs(strategy-init-gateway): defer decline-flag write to Phase 3 step 0; remove step 5c`

### Task 3: Repoint the 8 in-file cross-references to Phase 0 (claude-code SKILL.md)

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`

Apply these exact replacements (line numbers are pre-Task-1 anchors; locate by text after the earlier edits):

1. **Harness Integration — `harness-strategy` bullet** (orig line 328). Replace the sentence
   `Phase 3 step 5c delegates to this skill on "Yes".` with `Phase 0: GROUND delegates to this skill on "Yes".`
   and replace `On "No" init writes \`init.strategy.declined: true\` to \`.harness/state.json\`.`with`On "No" the decline is recorded in working memory and persisted as \`init.strategy.declined: true\` to
   \`.harness/state.json\` by Phase 3: CONFIGURE step 0 (after SCAFFOLD).`

2. **Harness Integration — `validateStrategy` bullet** (orig line 329). Replace the whole bullet:
   - OLD: `- **\`validateStrategy\`\*\* — \`@harness-engineering/core\` helper used by Phase 3 step 5c to detect present-but-invalid \`STRATEGY.md\`. Invoked through a Node one-liner so init does not require importing core directly.`
   - NEW: `- **\`validate_strategy\` / \`write_strategy\` MCP tools\*\* — used by Phase 0: GROUND to doc-validate \`STRATEGY.md\` and to detect a present-but-invalid one. Routed through the MCP server (which already has \`@harness-engineering/core\` loaded) so init does not require local \`node_modules\` or a \`node -e\` one-liner.`

3. **Success Criteria** (orig line 346). Replace `The strategy question (Phase 3 step 5c) was asked` with
   `The strategy question (Phase 0: GROUND) was asked`, and within the same bullet replace
   `Yes → \`STRATEGY.md\` exists and \`harness validate\` passes against \`StrategyDocSchema\``with`Yes → \`STRATEGY.md\` exists, doc-validated via \`validate_strategy\` against \`StrategyDocSchema\` (no project-level \`harness validate\` is run in Phase 0)`.

4. **Rationalizations row** (orig line 361). Replace `Phase 3 step 5c is the only point` with
   `Phase 0: GROUND is the only point`.

5. **Rationalizations row** (orig line 362). Replace `Phase 3 step 5c skips the prompt silently` with
   `Phase 0: GROUND skips the prompt silently`.

6. **Rationalizations row** (orig line 363). Replace `Phase 3 step 5c explicitly does NOT block` with
   `Phase 0: GROUND explicitly does NOT block`.

7. **Example 2 CONFIGURE block** (orig lines 442-445). Replace:
   - OLD line `Step 5c (strategy): "Capture strategic anchor (STRATEGY.md) now?"` →
     NEW `Phase 0 (strategy, asked before SCAFFOLD): "Capture strategic anchor (STRATEGY.md) now?"`
   - OLD line `  Result: STRATEGY.md exists at repo root; harness validate passes against StrategyDocSchema.` →
     NEW `  Result: STRATEGY.md exists at repo root, doc-validated via validate_strategy (StrategyDocSchema); no project-level harness validate runs in Phase 0.`

8. **Example 4 CONFIGURE block** (orig line 552). Replace
   `Phase 3 step 5c (strategy): "not sure."` with `Phase 0 (strategy): "not sure."`.

Then verify:

```bash
grep -in '5c' agents/skills/claude-code/initialize-harness-project/SKILL.md
# Expect: ZERO matches (SC7).
grep -n 'validateStrategy' agents/skills/claude-code/initialize-harness-project/SKILL.md
# Expect: ZERO matches (replaced by validate_strategy MCP wording).
grep -cn 'Phase 0: GROUND' agents/skills/claude-code/initialize-harness-project/SKILL.md
# Expect: several matches across Integration / Success Criteria / Rationalizations.
```

Run: `harness validate`. Commit: `docs(strategy-init-gateway): repoint step-5c cross-references to Phase 0`

### Task 4: Verify the edited SKILL.md reads correctly [checkpoint:human-verify]

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`

[checkpoint:human-verify] Before fanning the change out to 3 mirrors and the generated artifacts (a content
mistake propagates ×4 and into plugin output), pause and show the human:

1. The new `### Phase 0: GROUND` section in full.
2. The new `Phase 3: CONFIGURE` step 0.
3. Output of `grep -in '5c' agents/skills/claude-code/initialize-harness-project/SKILL.md` (must be empty).
4. Output of `grep -n '^### Phase' agents/skills/claude-code/initialize-harness-project/SKILL.md` (Phase 0
   before Phase 1).

Wait for confirmation that the prose is correct (plain-text offer, three branches intact, three guards present,
no forward-pointing "mirror" line, decline deferred). If the human requests wording changes, apply them to the
claude-code copy and re-confirm before Task 5. No commit (verification only).

### Task 5: Mirror to cursor / codex / gemini-cli and verify byte-identical

**Depends on:** Task 4 | **Files:** `agents/skills/{cursor,codex,gemini-cli}/initialize-harness-project/SKILL.md`

1. Copy the source of truth over each mirror:

   ```bash
   for p in cursor codex gemini-cli; do
     cp agents/skills/claude-code/initialize-harness-project/SKILL.md \
        agents/skills/$p/initialize-harness-project/SKILL.md
   done
   ```

2. Verify all three mirrors are byte-identical to claude-code (SC4):

   ```bash
   for p in cursor codex gemini-cli; do
     diff agents/skills/claude-code/initialize-harness-project/SKILL.md \
          agents/skills/$p/initialize-harness-project/SKILL.md \
       && echo "$p IDENTICAL" || echo "$p DRIFT"
   done
   # Expect: three "IDENTICAL" lines, no "DRIFT".
   ```

3. Run: `harness validate`.
4. Commit: `docs(strategy-init-gateway): mirror Phase 0 change to cursor/codex/gemini-cli`

### Task 6: Regenerate plugin artifacts, verify no drift, and run final checks

**Depends on:** Task 5 | **Files:** `.claude-plugin/commands/initialize-project.md`, `.cursor-plugin/commands/initialize-project.md` (+ gemini/codex outputs if emitted) | **Category:** integration

**Prerequisite:** `pnpm turbo build` complete (`packages/cli/dist/index.js` present). If absent, run
`pnpm install && pnpm turbo build` first.

1. Regenerate all four platform plugin artifacts:

   ```bash
   pnpm generate:plugin:all
   ```

2. Confirm no uncommitted drift in the generated trees (SC5). Because the command wrapper references the SKILL by
   path rather than inlining it, this is expected to be a clean no-op:

   ```bash
   git status --porcelain .claude-plugin .cursor-plugin
   # Expect: empty output (no changes). If non-empty, stage the regenerated files — they are the new source.
   ```

   Optionally cross-check via the check mode (must exit 0):

   ```bash
   pnpm generate:plugin:check && echo "PLUGIN OK"
   ```

3. Final verification sweep across all four mirrors (SC4, SC7):

   ```bash
   for p in claude-code cursor codex gemini-cli; do
     echo "== $p =="; grep -in '5c' agents/skills/$p/initialize-harness-project/SKILL.md || echo "  no 5c"
   done
   diff agents/skills/claude-code/initialize-harness-project/SKILL.md agents/skills/cursor/initialize-harness-project/SKILL.md && echo "cursor OK"
   diff agents/skills/claude-code/initialize-harness-project/SKILL.md agents/skills/codex/initialize-harness-project/SKILL.md && echo "codex OK"
   diff agents/skills/claude-code/initialize-harness-project/SKILL.md agents/skills/gemini-cli/initialize-harness-project/SKILL.md && echo "gemini OK"
   ```

4. Run: `harness validate` (SC6 — expect pass modulo the documented pre-existing circular-dep and design-token
   findings, which this doc-only change does not touch).

5. Commit (only if step 2 produced staged changes): `chore(strategy-init-gateway): regenerate plugin command artifacts`.
   If `pnpm generate:plugin:all` produced no changes, note "no plugin drift — wrapper references SKILL by path"
   and skip the commit.

---

## Sequencing & Notes

- Tasks 1 → 2 → 3 are sequential edits to the same source file; Task 4 is a human-verify gate; Tasks 5 and 6
  fan out and integrate. No parallelism (single source file, then mechanical copy + generate).
- **Pre-existing validation noise:** `harness validate` and `harness check-deps` already report two circular
  dependencies (`drift/findings` ↔ `drift/catalog`, `craft/llm` chain) and many dashboard design-token warnings
  on the untouched baseline. These are out of scope and must not be "fixed" here; they are the expected baseline
  for the "passes" criterion.
- **`.harness/failures.md`** check: no entry matches this doc-only relocation approach.
- **Integration tier = small:** the spec's Integration Points name only artifact regeneration and the in-file
  cross-reference repoints (both folded into Tasks 3, 5, 6). No ADR, no knowledge-graph enrichment, no external
  doc updates (`harness-strategy/SKILL.md` and CHANGELOGs are explicitly out of scope per the spec).
