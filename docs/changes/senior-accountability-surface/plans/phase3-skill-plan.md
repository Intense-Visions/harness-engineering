# Plan: Phase 3 — `harness:pre-merge-brief` Skill

**Date:** 2026-07-02 | **Spec:** `docs/changes/senior-accountability-surface/proposal.md` | **Tasks:** 8 | **Time:** ~30 min | **Integration Tier:** medium

## Scope

Phase 3 of the Senior-Engineer Accountability Surface spec: author the **`harness:pre-merge-brief`
skill** — a **thin wrapper** over the `harness pre-merge-brief` CLI command built in Phase 2. The
command already contains all the logic (compose brief, degrade each section, sticky-upsert the PR
comment). The skill orchestrates _invocation_: gather inputs, run the command, communicate
degradation, and hand off. The skill is authored (SKILL.md + skill.yaml), registered/indexed at
tier 2, and made discoverable via slash-command regeneration.

**Explicitly out of scope (other phases — do NOT implement here):**

- Phase 1 (`@harness-engineering/signals` extraction) — **DONE** (`packages/signals/` exists).
- Phase 2 (`harness pre-merge-brief` command) — **DONE** on branch `feat/signals-package-extraction`
  (`packages/cli/src/commands/pre-merge-brief.ts` exists; flags `--from <path>`, `--comment`,
  `--diff <range>`).
- Phase 4 — dogfood wiring in `.github/workflows/required-review.yml` + `pull-requests: write`.
- Phase 5 — docs, ADRs (D1, D6), knowledge enrichment, follow-up roadmap rows.

## Environment

- **Node 22 required.** All build/validate/generate tasks below run with
  `~/.nvm/versions/node/v22.20.0/bin` on `PATH`. Node 26 (the machine default) breaks
  `better-sqlite3` (native ABI) which the graph/skill tooling loads. Prefix each shell task with
  `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"` (or `nvm use 22`).
- Work happens on branch `feat/signals-package-extraction` (where the Phase 2 command lives). If a
  fresh branch is preferred for the skill, branch from there so the command is present.

## Goal

Ship a discoverable, validated tier-2 skill `harness-pre-merge-brief` that runs the existing
`harness pre-merge-brief` command on `on_pr` and `manual` triggers, produces/upserts the
senior-facing sticky PR comment, reports degradation honestly, and transitions cleanly — as a thin
orchestration layer over the command, adding no brief-composition logic of its own.

## Observable Truths (Acceptance Criteria)

1. **Skill files exist** at `agents/skills/claude-code/pre-merge-brief/SKILL.md` and
   `agents/skills/claude-code/pre-merge-brief/skill.yaml` (directory name `pre-merge-brief`, matching
   the spec's stated path in "Technical design → Skill"; skill `name` field is `harness-pre-merge-brief`).
2. **`skill.yaml` parses against `SkillMetadataSchema`** (`packages/cli/src/skill/schema.ts`) with:
   `name: harness-pre-merge-brief`, semver `version`, `cognitive_mode`, `triggers: [on_pr, manual]`,
   `platforms: [claude-code, gemini-cli, cursor, codex]`, `tools`, a `cli` mapping to
   `harness pre-merge-brief`, an `mcp` mapping (`tool: run_skill`), `type: rigid`, `tier: 2`, `phases`,
   `depends_on`.
3. **SKILL.md is rich-format** — H1 title + blockquote purpose, `## When to Use`, `## Process`
   (phases), `## Gates`, `## Success Criteria` — matching the shape of `outcome-eval/SKILL.md`. It
   describes running the command as a **thin wrapper** (invocation + degradation messaging +
   transition), not re-implementing brief composition.
4. **The skill is discoverable:** `harness skill list` includes `harness-pre-merge-brief`, and
   `harness skill run harness-pre-merge-brief` resolves and emits the SKILL.md content with preamble
   (exit 0) — on Node 22.
5. **Slash commands regenerated:** running `harness generate` (or `harness generate-slash-commands`)
   produces a `pre-merge-brief` (or `harness-pre-merge-brief`) command artifact under
   `agents/commands/claude-code/harness/` and the sibling `gemini-cli` output, and refreshes the
   `.claude-plugin/commands/` / `.cursor-plugin/commands/` artifacts, with no unintended deletions.
6. **Skills index carries tier 2:** `.harness/skills-index.json` (rebuilt by the index-builder /
   generate step) lists `harness-pre-merge-brief` with `tier: 2`.
7. **Catalog + AGENTS.md updated:** `docs/reference/skills-catalog.md` (auto-generated via
   `pnpm run generate-docs`) includes `harness-pre-merge-brief`, and the tier-2 prose list in
   `AGENTS.md` (line ~766) names it, with the tier-2 count bumped 25 → 26.
8. **`harness validate` passes** on Node 22 after all changes.

## Reference Skills (studied for format — not modified)

- `agents/skills/claude-code/outcome-eval/skill.yaml` + `SKILL.md` — closest analog: a tier-2,
  `[manual, on_pr]`, CLI/command-wrapping skill. Mirror its SKILL.md section structure and its
  `phases`/`type: rigid` shape. **Diverge** on: `platforms` (outcome-eval is claude-code only; ours
  is all four), and the `mcp` mapping (ours uses `run_skill`, per the task spec, since the brief is
  produced by the CLI command, not a dedicated MCP judge tool).
- `agents/skills/claude-code/harness-roadmap-pilot/skill.yaml` — reference for the `cli:` block shape
  (`command: harness skill run …`, `args:`), the four-platform list, `mcp.tool: run_skill`, and
  `depends_on`.

## Skill Recommendations (from SKILLS.md — reference tier, load as context)

`ts-type-guards`, `ts-zod-integration` (skill.yaml is zod-validated), `gof-facade-pattern` (a
thin-wrapper skill IS a facade over the command). No Apply-tier skills flagged.

## File Map

- CREATE `agents/skills/claude-code/pre-merge-brief/skill.yaml`
- CREATE `agents/skills/claude-code/pre-merge-brief/SKILL.md`
- MODIFY `AGENTS.md` (tier-2 prose list ~line 766: add skill, bump count 25→26)
- REGENERATE (tooling writes; do not hand-edit):
  - `.harness/skills-index.json`
  - `agents/commands/claude-code/harness/pre-merge-brief.md`
  - `agents/commands/gemini-cli/harness/pre-merge-brief.toml`
  - `.claude-plugin/commands/pre-merge-brief.md`, `.cursor-plugin/commands/pre-merge-brief.md`
  - `docs/reference/skills-catalog.md`

## Uncertainties

- **[ASSUMPTION]** Skill directory name is `pre-merge-brief` (per spec "Technical design → Skill"),
  while the `name` field is `harness-pre-merge-brief` (per task requirements). This mirrors
  `outcome-eval` (dir `outcome-eval`, name `outcome-eval`) and `harness-roadmap-pilot` (dir ==
  name). We follow the spec's stated directory path. If validation/generation requires
  dir == name, Task 3 renames the directory to `harness-pre-merge-brief`.
- **[ASSUMPTION]** `mcp.tool: run_skill` with `input: { skill: harness-pre-merge-brief, path: string }`
  is the correct MCP mapping (per task requirements + `harness-roadmap-pilot` precedent), since the
  brief is produced by the CLI command rather than a bespoke MCP tool like `outcome_eval`.
- **[DEFERRABLE]** Exact prose wording of SKILL.md sections — refined during authoring; does not
  affect task structure.
- **[DEFERRABLE]** Whether `harness generate` vs `harness generate-slash-commands` is the canonical
  regeneration entry point. Task 5 runs `harness generate` (superset: slash commands + agent defs);
  falls back to `generate-slash-commands` if `generate` over-writes unrelated artifacts.

## Skeleton

_Not produced — task count (8) is below the standard-mode threshold (8 requires skeleton only at
`>= 8`; borderline). Tasks are short, sequential, and low-ambiguity; direction is anchored by the
existing `outcome-eval` reference skill. Proceeding straight to full tasks._

## Tasks

### Task 1: Author `skill.yaml`

**Depends on:** none | **Files:** `agents/skills/claude-code/pre-merge-brief/skill.yaml`

1. Create directory `agents/skills/claude-code/pre-merge-brief/` and write `skill.yaml`:

   ```yaml
   name: harness-pre-merge-brief
   version: '0.1.0'
   description: >-
     Thin-wrapper skill that runs the `harness pre-merge-brief` command to compose
     and post the senior-facing pre-merge accountability brief — the diff summary,
     the multi-persona review verdict (from review-ci --json), the curated Signal
     status snapshot, the outcome-eval result, and a derived "Worth your eyes"
     section — as a single sticky PR comment (upsert by marker). All composition and
     degradation logic lives in the command; the skill orchestrates invocation,
     communicates which sections degraded to "unavailable", and hands off. Runs on
     on_pr and manual. The harness pointed at the human who clicks merge.
   stability: draft
   cognitive_mode: constructive-architect
   triggers:
     - on_pr
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools:
     - Bash
     - Read
     - Glob
     - Grep
     - emit_interaction
   cli:
     command: harness pre-merge-brief
     args:
       - name: from
         description: Path to the review-ci --json CiReviewResult artifact to reuse
         required: false
       - name: comment
         description: Upsert the brief as a sticky PR comment via gh (by marker)
         required: false
       - name: diff
         description: 'git diff range for the diff summary (e.g. origin/main...HEAD)'
         required: false
   mcp:
     tool: run_skill
     input:
       skill: harness-pre-merge-brief
       path: string
   type: rigid
   tier: 2
   phases:
     - name: gather
       description: Locate the review-ci --json artifact, resolve the diff range, confirm gh auth for --comment
       required: true
     - name: compose
       description: Run `harness pre-merge-brief` with the resolved inputs; the command builds the brief and (with --comment) upserts the sticky PR comment
       required: true
     - name: report
       description: Report which sections rendered and which degraded to "unavailable"; surface the "Worth your eyes" items
       required: true
     - name: handoff
       description: Emit the transition; the brief is advisory (non-blocking) and never flips the review gate
       required: true
   state:
     persistent: false
   depends_on:
     - harness-code-review
     - outcome-eval
   ```

2. Validate the YAML parses: run (Node 22)
   `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && harness skill validate 2>&1 | grep -iE 'pre-merge|error|invalid|passed' | head`.
   Expect no schema error for `harness-pre-merge-brief`.
3. Run: `harness validate`
4. Commit: `feat(senior-accountability): add pre-merge-brief skill.yaml`

### Task 2: Author `SKILL.md` (rich format, thin-wrapper)

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/pre-merge-brief/SKILL.md`

**Skills:** `gof-facade-pattern` (reference)

Write `agents/skills/claude-code/pre-merge-brief/SKILL.md` mirroring `outcome-eval/SKILL.md`'s
structure. Required sections and content:

1. **H1 + blockquote purpose:**
   `# Pre-Merge Brief` then a one-blockquote summary: composes the senior-facing accountability brief
   from existing artifacts (review-ci verdict + Signal status + outcome-eval + diff) and upserts it as
   one sticky PR comment. State explicitly: **this skill is a thin wrapper — all composition and
   degradation logic lives in the `harness pre-merge-brief` command; the skill orchestrates
   invocation, degradation messaging, and handoff, and never re-implements brief composition.**
2. **`## When to Use`:**
   - On `on_pr` — after the multi-persona review (`review-ci`) has run and emitted its `--json`
     artifact, to give the human who clicks merge a consolidated "worth your eyes" surface.
   - `manual` — when a senior wants the brief on demand for the current branch.
   - NOT to re-run or modify the review (the brief **consumes** `review-ci` output; D1/spec non-goal).
   - NOT as a merge gate — the brief is advisory/non-blocking (D3); a brief failure must never flip
     the review gate's status.
   - NOT for composing brief Markdown by hand — that is the command's `buildBriefBody`.
3. **`## Process`** with four phases matching `skill.yaml`:
   - **Phase 1: GATHER** — locate the `review-ci --json` artifact (e.g. `/tmp/review.json` in CI, or
     re-point `--from`); resolve the diff range for `--diff` (default `origin/main...HEAD`); if
     posting, confirm `gh` is authenticated. Each input is optional — a missing input degrades its
     brief section, it does not block.
   - **Phase 2: COMPOSE** — run the command. Local/inspect:
     `harness pre-merge-brief --from <path> --diff <range>`. Post the sticky comment:
     `harness pre-merge-brief --from <path> --comment`. The command renders all six sections and (with
     `--comment`) upserts the marked comment (`<!-- harness:pre-merge-brief -->`) rather than posting
     anew.
   - **Phase 3: REPORT** — surface which sections rendered vs degraded to "unavailable / not
     configured", and read back the **"👀 Worth your eyes"** union (blocking findings ∪ warn/alert
     signals ∪ unmet outcome criteria). Do not editorialize beyond what the command emitted.
   - **Phase 4: HANDOFF** — emit the transition; the brief is advisory. Note that on `on_pr` in CI the
     step is `continue-on-error` (Phase 4 dogfood wiring, separate).
4. **`## Harness Integration`:** the command
   `packages/cli/src/commands/pre-merge-brief.ts` (flags `--from`, `--comment`, `--diff`); consumes
   the `CiReviewResult` JSON from `review-ci --json`; `gatherSignals` from
   `@harness-engineering/signals`; graph `execution_outcome` nodes for outcome-eval; the sticky-upsert
   marker `<!-- harness:pre-merge-brief -->`.
5. **`## Gates`:**
   - **Thin wrapper only.** If you find yourself composing brief Markdown or re-deriving the "worth
     your eyes" set in the skill, STOP — that logic is the command's; call the command.
   - **Never re-run the review.** The brief consumes `review-ci` output; it never re-runs or
     duplicates review logic (spec non-goal).
   - **Advisory, never blocking.** A brief failure must not flip the review gate. Report degradation;
     do not halt the workflow.
   - **Honest degradation.** Report each "unavailable" section explicitly; never fabricate a section
     the command marked unavailable.
6. **`## Success Criteria`:** point to `docs/changes/senior-accountability-surface/proposal.md`; this
   skill delivers Goal (2) "a `harness:pre-merge-brief` skill wrapping the command (`on_pr` +
   `manual`)".

Then:

7. Run: `harness skill validate` (Node 22) — confirm SKILL.md structure passes for the skill.
8. Run: `harness validate`
9. Commit: `feat(senior-accountability): add pre-merge-brief SKILL.md`

### Task 3: Verify skill discovery (`skill list` / `skill run`)

**Depends on:** Task 2 | **Files:** none (verification) | **Category:** integration

[checkpoint:human-verify]

1. Run (Node 22):
   `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && harness skill list 2>&1 | grep -i pre-merge`.
   Expect a line for `harness-pre-merge-brief`.
2. Run: `harness skill run harness-pre-merge-brief 2>&1 | head -20`. Expect exit 0 and the SKILL.md
   content emitted with the context preamble (no "Skill not found").
3. If either fails with "Skill not found": the loader keys skills by directory name. Rename the
   directory `agents/skills/claude-code/pre-merge-brief` → `harness-pre-merge-brief` (git mv), then
   re-run steps 1-2. (This resolves the [ASSUMPTION] in Uncertainties.)
4. Show the human the `skill list` line and `skill run` head. Confirm discovery before proceeding.
5. Commit (only if a rename was needed): `fix(senior-accountability): align pre-merge-brief skill dir with name`

### Task 4: Rebuild the skills index (tier 2)

**Depends on:** Task 3 | **Files:** `.harness/skills-index.json` (regenerated) | **Category:** integration

1. Rebuild the index (Node 22). The index-builder writes `.harness/skills-index.json` and reads
   `tier` from each `skill.yaml`. Trigger it via the generate step (Task 5 also refreshes it) or its
   direct path if exposed. Run:
   `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && harness generate --dry-run 2>&1 | grep -i pre-merge` to preview, then the real run in Task 5.
2. After Task 5's real generate, confirm:
   `grep -A3 'harness-pre-merge-brief' .harness/skills-index.json | grep -i tier` shows `"tier": 2`.
3. (No separate commit — the index is committed alongside Task 5's generated artifacts.)

### Task 5: Regenerate slash commands + agent integrations

**Depends on:** Task 4 | **Files:** `agents/commands/**`, `.claude-plugin/commands/**`, `.cursor-plugin/commands/**`, `.harness/skills-index.json` (all regenerated) | **Category:** integration

1. Dry-run first (Node 22):
   `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && harness generate --platforms claude-code,gemini-cli,cursor,codex --dry-run`.
   Confirm it reports ADDING `pre-merge-brief` artifacts and no unexpected deletions.
2. Real run: `harness generate --platforms claude-code,gemini-cli,cursor,codex --yes`.
   (If `harness generate` rewrites unrelated artifacts, fall back to
   `harness generate-slash-commands --platforms claude-code,gemini-cli,cursor,codex --yes` per the
   task-spec-named command.)
3. Confirm the generated command exists:
   `ls agents/commands/claude-code/harness/pre-merge-brief.md agents/commands/gemini-cli/harness/pre-merge-brief.toml`.
4. Confirm the index carries tier 2 (Task 4 step 2).
5. Run: `harness validate`
6. Commit: `chore(senior-accountability): regenerate slash commands + skill index for pre-merge-brief`

### Task 6: Regenerate the skills catalog

**Depends on:** Task 5 | **Files:** `docs/reference/skills-catalog.md` (regenerated) | **Category:** integration

1. Regenerate the auto-generated catalog (Node 22):
   `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && pnpm run generate-docs`.
2. Confirm the entry: `grep -n 'harness-pre-merge-brief' docs/reference/skills-catalog.md` shows the
   skill; verify it lists `Triggers: on_pr, manual` and all four platforms, and that the tier-2
   section count incremented.
3. Run: `harness validate`
4. Commit: `docs(senior-accountability): regenerate skills catalog for pre-merge-brief`

### Task 7: Update AGENTS.md tier-2 list

**Depends on:** Task 6 | **Files:** `AGENTS.md` | **Category:** integration

1. In `AGENTS.md`, edit the **Tier 2 (Maintenance, 25 skills)** line (~line 766): change the count
   `25` → `26` and append `pre-merge-brief` to the comma-separated skill list (after
   `maintenance-pipeline`).
2. Run: `harness validate`
3. Commit: `docs(senior-accountability): register pre-merge-brief in AGENTS.md tier-2 list`

### Task 8: Final verification pass

**Depends on:** Task 7 | **Files:** none (verification) | **Category:** integration

[checkpoint:human-verify]

1. Run the full gate on Node 22:
   `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && harness validate && harness skill validate 2>&1 | grep -iE 'pre-merge|passed|error'`.
2. Re-confirm discovery end-to-end:
   `harness skill run harness-pre-merge-brief 2>&1 | head -5` (exit 0, SKILL.md preamble).
3. Confirm generated artifacts are present and committed:
   `git status --porcelain` should be clean (or show only expected generated files if not yet
   committed), and
   `ls agents/commands/claude-code/harness/pre-merge-brief.md .harness/skills-index.json`.
4. Present to the human: `skill list`/`skill run` output, the catalog entry, and the AGENTS.md diff.
   Confirm Phase 3 is complete and that Phase 4 (dogfood) / Phase 5 (docs, ADRs) remain unstarted.

## Sequencing Notes

- Tasks are strictly sequential: author (1-2) → verify discovery (3) → regenerate index/commands
  (4-5) → regenerate catalog (6) → register in prose (7) → final gate (8).
- No parallelism: every task after 2 depends on the authored skill files, and the regeneration steps
  read a stable index.
- The single-write-of-truth for tier is `skill.yaml`'s `tier: 2`; the index and catalog are derived,
  and AGENTS.md's prose list is the only hand-maintained mirror.

## Harness Integration

- `harness validate` — in every task; run on Node 22.
- `harness skill validate` — Tasks 1, 2, 8 (skill.yaml schema + SKILL.md structure).
- `harness skill list` / `harness skill run harness-pre-merge-brief` — discovery checks (Tasks 3, 8).
- `harness generate` (or `harness generate-slash-commands`) — Task 5 (slash commands + skill index).
- `pnpm run generate-docs` — Task 6 (skills catalog).
- Plan committed after writing (Phase 4 Step 8 of planning methodology).
