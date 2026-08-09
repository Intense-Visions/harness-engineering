# Plan: fleet-command skill (Phase 1 — author, register, regenerate, validate)

**Date:** 2026-08-08 · **Spec:** `docs/changes/fleet-command/proposal.md` · **Tasks:** 18 · **Time:** ~95 min · **Integration Tier:** large

## Goal

Author the `fleet-command` claude-code rigid orchestrator skill (`SKILL.md` + `skill.yaml`) — the **conductor** one tier above the eleven `-fleet` members, deliberately not named `-fleet`, which plans a multi-fleet run as a derived dependency DAG, enforces one **global** leaf-slot budget instead of additive per-fleet governors, owns cross-fleet deconfliction over four collision classes, batches the members' human gates by wave without ever answering them, verifies each lane from its emitted artifacts rather than re-running it, and emits one consolidated report — then verify the already-written conductor-tier ADR, add the conductor-tier section to the family spine page, regenerate every platform integration with accurate counts, add a changeset, and pass every local gate.

This phase ships **documentation / skill-authoring only** — no `packages/**` source changes.

---

## Hard constraint (carried into every authoring task)

**The shipped `SKILL.md`, the shipped `skill.yaml`, and every generated command/manifest derived from them MUST NOT cite internal roadmap, PR, or issue numbers.** No `#1226`, no `#1194`, no `PR #NNNN`, no `issue #NNNN`, no `sub-project #N`. Those artifacts are copied verbatim into adopter projects that have never heard of this repo's tracker. The family ADRs and the spine page are cited **by title only** — never by number — inside the shipped body.

Internal references belong in exactly three places: `docs/changes/fleet-command/**` (this plan and the spec), the commit message, and the PR description. `docs/reference/fleet-family.md` and `docs/knowledge/decisions/**` are repo-internal docs and may cite ADR numbers; the shipped skill body may not.

The mechanical backstop is `agents/skills/tests/internal-refs.test.ts`, which greps every shipped surface for `(roadmap|PR|pull request|issue) #\d{1,4}`, `sub-project #N`, `<name>-craft|-pipeline #N`, and `` `skill-name` (#N) ``. It is a backstop, not the rule — a leak it does not pattern-match is still a leak.

---

## Observable Truths (Acceptance Criteria)

1. `node packages/cli/dist/bin/harness.js skill validate fleet-command` exits 0.
2. `agents/skills/claude-code/fleet-command/SKILL.md` contains, in order: an `# ` h1, a `> ` summary blockquote, `## When to Use`, `## Flags`, `## Process` (containing `### Iron Law`, five named phase subsections SELECT / CONFIRM / DISPATCH / VERIFY / REPORT, and a `### The Contention Map` subsection), `## Harness Integration`, `## Success Criteria`, `## Gates`, `## Escalation`, `## Rationalizations to Reject`, `## Red Flags`, `## Examples`, `## Test Scenarios` — 11 `^## ` headings total.
3. `agents/skills/claude-code/fleet-command/skill.yaml` parses against `SkillMetadataSchema` with `type: rigid`, `tier: 2`, `cognitive_mode: systematic-orchestrator`, and every `depends_on` entry resolving to an existing skill directory.
4. The shipped body carries **no internal roadmap/PR/issue numbers**: `(cd agents/skills && npx vitest run)` passes `internal-refs`, and `grep -nE '#[0-9]{1,4}|ADR [0-9]{3,4}' agents/skills/claude-code/fleet-command/*` returns nothing.
5. The Iron Law names all four properties — **global budget, derived order, untouched gates, never merge** — and states each as law rather than guidance.
6. The `SKILL.md` carries the **five-wave DAG table** (wave 0 CI prerequisite; wave 1 spine head + parallel sweeps; wave 2 decide; wave 3 build; wave 4 terminal land) with the CI-prerequisite rationale stated, not assumed.
7. The `SKILL.md` carries the **four-class contention map table** (generated artifacts / allocated sequences / same-region source edits / duplicate filings), each with its stated mechanism, plus the explicit statement that the map **degrades to empty without breaking**.
8. The global governor is stated in **leaf slots** (default 3, hard max 4, no single fleet above ~3 of the pool), with the explicit statement that fleets in cheap phases hold no slot, and the explicit statement that **tokens are not metered** because they are not observable.
9. The `SKILL.md` states that a member's CONFIRM is presented **verbatim and unmodified**, and that the conductor never pre-answers, defaults, skips, or summarizes it.
10. VERIFY is stated to confirm the **lane** from emitted artifacts with independent spot-checks of the per-item verdict references, and all-OS CI is recorded **not-applicable at this tier** with its reason, never silently dropped.
11. `agents/skills/{codex,cursor,gemini-cli}/fleet-command` each resolve as symlinks to `../claude-code/fleet-command` (`test -L` plus `readlink`, git mode `120000`).
12. `docs/reference/fleet-family.md` has a **conductor tier** section naming the tier, why it is not named `-fleet`, and the four properties it adds, plus a References entry for the conductor-tier ADR. The **Members table stays at eleven rows** — the conductor is not a member.
13. `docs/knowledge/decisions/0091-fleet-command-conductor-tier-authority-model.md` is verified (not re-authored): frontmatter complete and conformant, `status: accepted`, the three required sections present, every relative ADR link resolving, and its `First instance` path pointing at the file this plan creates.
14. `.claude-plugin/commands/fleet-command.md`, `.cursor-plugin/commands/fleet-command.md`, `.gemini-extension/commands/fleet-command.toml`, and `.antigravity-extension/commands/fleet-command.toml` all exist; the last two are byte-identical.
15. `pnpm generate:plugin:check` exits 0, and the per-directory command counts are **exactly** `.claude-plugin/commands` 84, `.cursor-plugin/commands` 85, `.gemini-extension/commands` 66, `.antigravity-extension/commands` 66.
16. `node scripts/generate-docs.mjs --check` exits 0; `docs/reference/skills-catalog.md` carries a `### fleet-command` entry and reads **`788 skills`** and **`Tier 2 — Maintenance (68 skills)`**.
17. `docs/roadmap.d/fleet-command.md` reads `**Status:** in-progress` (its `**Plan:**` field already points at this file), and `docs/roadmap.md` is regenerated to match.
18. A changeset exists at `.changeset/fleet-command.md` bumping `@harness-engineering/cli` `minor`, whose body carries **no internal roadmap/PR/issue numbers** (it is published in the release changelog).
19. `(cd agents/skills && npx vitest run)` reports **10 test files passed** (baseline 34173 tests; expect a slightly higher count with fleet-command added).
20. `pnpm format:check` exits 0 — including the two pre-existing failures this plan repairs in Task 1.
21. `node packages/cli/dist/bin/harness.js check-vocabulary` exits 0 (`subagent`, `subtask`, `codebase`, `greenfield`, `main branch`).
22. `BASE_REF=origin/main node scripts/check-changesets.mjs` exits 0.
23. `pnpm docs:build` exits 0.
24. `harness validate` reports **389 issues** (baseline 390 minus the fleet-command roadmap advisory Task 16 resolves), and `grep -c 'claude-code/fleet-command'` over its output is **0**.

---

## NFR Targets

**All four NFR dimensions were explicitly skipped, deliberately and not by omission.** The deliverable is markdown instruction text plus generated metadata: there is no hot path to benchmark, no untrusted-input parser, no load profile, and no runtime failure mode of its own. The standing defaults stand unchanged — `harness check-perf` budgets and `harness check-security` floors run as configured inside `harness validate` and CI. **No `category: nfr` task is emitted.**

---

## Uncertainties

- **[RESOLVED]** The branch `feat/fleet-command` is **1 ahead, 0 behind** `origin/main` (`44296e3fa`, the craft-fleet merge). No merge task is needed and no catalog-count reconciliation is owed — the committed catalog (`787 skills`, `Tier 2 (67)`) matches the 787 skill directories on disk exactly, and `generate-docs --check` is green today.
- **[RESOLVED — must be handled first]** `pnpm format:check` is **RED on this branch today**, on two files from the spec commit: `docs/changes/fleet-command/proposal.md` and `docs/knowledge/decisions/0091-fleet-command-conductor-tier-authority-model.md`. Both use `*emphasis*` where prettier wants `_emphasis_`. This is pre-existing and unrelated to the skill body, but it fails CI, so Task 1 repairs it.
- **[RESOLVED]** The worktree had **no `node_modules` and no built `dist`** when this plan was written. `pnpm install --frozen-lockfile` (7.6 s, exit 0) and `pnpm build` (turbo, ~10 s, exit 0) were both run during planning and both succeeded, so the toolchain is in place. Task 1 re-verifies rather than assuming.
- **[RESOLVED]** `docs/roadmap.d/fleet-command.md` already exists (`order: 15`, `**Status:** planned`) and its `**Plan:**` field **already points at this file**. Only `Status:` changes, in Task 16.
- **[RESOLVED]** The conductor-tier ADR is **already written and committed** at `docs/knowledge/decisions/0091-…`. Task 2 verifies and reviews it; nothing re-authors it.
- **[ASSUMPTION]** Flag set: `--fleets`, `--slots`, `--max-fleets`, `--wall-clock`, `--report-only`, `--dry-run`. `--report-only` and `--dry-run` mirror every sibling; the other four expose exactly the four budget levers the spec names as enforceable (slots, passes, fleet count, wall-clock) minus the pass cap, which is fixed at **one pass per fleet per run** by Decision 3 and is therefore deliberately **not** a flag — exposing it would invite the "just one more sweep" drift the bound exists to prevent. If wrong, only Task 3 and the `## Flags` table in Task 4 change.
- **[ASSUMPTION]** `depends_on` lists exactly the **eleven members** (`ideate-fleet`, `issue-fleet`, `adr-fleet`, `roadmap-fleet`, `pr-fleet`, `cicd-fleet`, `test-fleet`, `security-fleet`, `cleanup-fleet`, `bug-fleet`, `craft-fleet`). All eleven directories were verified to exist, so `references.test.ts` resolves. `harness-roadmap-pilot` is deliberately **absent**: the conductor does not score items, it schedules fleets.
- **[ASSUMPTION]** `addresses:` signals = `backlog-pressure` (0.4) + `drift` (0.2). Both are established in the shipped vocabulary (`backlog-pressure` appears in 6 skill manifests, `drift` in 12). The weights sit just below `roadmap-fleet`'s and `pr-fleet`'s `backlog-pressure: 0.5` because the conductor is a capstone the operator reaches for deliberately, not a first responder to backlog pressure.
- **[ASSUMPTION]** Platform symlink set is exactly `codex`, `cursor`, `gemini-cli` (matches every sibling). `antigravity` is a plugin-generation target that reuses the gemini-cli skill tree, not a skill-symlink source.
- **[ASSUMPTION]** A changeset is added (`@harness-engineering/cli: minor`) following the `adr-fleet` precedent, even though `check-changesets.mjs` does **not** require one for a non-`packages/**` change (it reports "No publishable package changes detected"). The sibling `craft-fleet` shipped without one; `adr-fleet` shipped with one. Adding it is the more informative choice and cannot fail the gate. If the human prefers the craft-fleet precedent, delete Task 17 — nothing else depends on it.
- **[DEFERRABLE]** Exact connective prose, the example-transcript numbers, and the Test Scenario narratives. Section order, table shapes, record shapes, and the load-bearing sentences are pinned below; the prose around them is authored at execution time — that is the deliverable's substance, not deferred detail.

---

## Environment Facts (verified during planning — do not re-derive)

| Fact                                                                                                                                                                           | Consequence                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default `node` on this machine is **v26.7.0**; the repo pin is **22**                                                                                                          | Every task prefixes `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"`. Verified `v22.20.0` present. Node 26 breaks `better-sqlite3` (native ABI) and the git hooks.                      |
| The worktree started **uninstalled and unbuilt**; `pnpm install --frozen-lockfile` then `pnpm build` were run during planning, both exit 0 (~8 s and ~10 s)                    | `node_modules`, `docs/node_modules`, `agents/skills/node_modules`, `node_modules/.bin/tsx`, and every `packages/*/dist` now exist. Task 1 re-verifies; it does not assume.                         |
| `packages/cli/dist/bin/harness.js` is a real built CLI here                                                                                                                    | Use it for every harness command. `which harness` is a **global published bundle** that validates its own skills, not this tree's 787, and will report success without ever reading fleet-command. |
| Branch `feat/fleet-command` is **1 ahead / 0 behind** `origin/main` (`44296e3fa`)                                                                                              | No merge task. The catalog baseline is clean and the delta is a plain `+1`.                                                                                                                        |
| `pnpm format:check` baseline: **RED, exit 1** — `docs/changes/fleet-command/proposal.md` and `docs/knowledge/decisions/0091-….md`, both `*em*` → `_em_`                        | Pre-existing, from the spec commit. **Task 1 repairs it.** Any _other_ format failure later is caused by this change.                                                                              |
| `node scripts/generate-docs.mjs --check` baseline: **exit 0**                                                                                                                  | Catalog is fresh. After the skill lands it must be regenerated to `788` / `Tier 2 (68)`.                                                                                                           |
| `pnpm generate:plugin:check` (all five targets) baseline: **exit 0**, ~40 s, leaves no `tmp-plugin-*` residue                                                                  | Safe to run repeatedly. `.gitignore` covers `tmp-plugin-*-commands/` and `tmp-plugin-*-agents/`.                                                                                                   |
| `(cd agents/skills && npx vitest run)` baseline: **10 files, 34173 tests passed, ~5 s**                                                                                        | Fast enough to run after every authoring slice.                                                                                                                                                    |
| `node packages/cli/dist/bin/harness.js check-vocabulary` baseline: **clean, 3541 files, 5 rules**                                                                              | Prose must use `subagent`, `subtask`, `codebase`, `greenfield`, `main branch`.                                                                                                                     |
| `harness validate` baseline: **390 issues, exit 1** (pre-existing design-token/roadmap advisory noise)                                                                         | One of the 390 is fleet-command's own: the shard `has assignee "Chad Warner" but status "planned"`. Task 16's status flip removes it. **Expect 389 after.**                                        |
| `grep -c 'fleet-command'` over `harness validate` output is **317 at baseline** — the worktree path itself contains `fleet-command`                                            | The "no issue names my files" check must grep **`claude-code/fleet-command`** (baseline **0**), never bare `fleet-command`.                                                                        |
| `BASE_REF=origin/main node scripts/check-changesets.mjs`: **"No publishable package changes detected." exit 0**                                                                | A changeset is optional for this change. Task 17 adds one anyway, by `adr-fleet` precedent; it cannot fail the gate either way.                                                                    |
| `pnpm docs:build` (VitePress) runs locally here and exits 0 (~8 s, exercised inside `pnpm build`)                                                                              | Do not defer the VitePress gate to CI.                                                                                                                                                             |
| `node packages/cli/dist/bin/harness.js skill validate craft-fleet` exits 0                                                                                                     | The single-skill validate path works in this tree; use it verbatim for fleet-command.                                                                                                              |
| Baseline command counts: claude **83**, cursor **84**, gemini **65**, antigravity **65**                                                                                       | After fleet-command: **84 / 85 / 66 / 66**.                                                                                                                                                        |
| Baseline skill-dir count: **787** (`ls -d agents/skills/claude-code/*/`), catalog header `787 skills`, `Tier 2 — Maintenance (67 skills)`, 787 `### ` entries — all consistent | After fleet-command: **788 skills**, **`Tier 2 — Maintenance (68 skills)`**.                                                                                                                       |
| `.husky/pre-commit` runs `harness ci check`, `lint-staged`, then **`pnpm generate:plugin:all` in write mode** if `agents/skills/` is staged and `generate:plugin:check` drifts | Write-mode regeneration is the repo's own sanctioned path. Task 15 uses it deliberately, with a count snapshot and a `git checkout` recovery step, so a surprise never lands unnoticed.            |
| `.husky/pre-commit` also runs `harness roadmap regen` and re-stages `docs/roadmap.md` whenever a shard is staged                                                               | Task 16's manual `roadmap regen` keeps the working tree honest; the hook is the backstop, not the mechanism.                                                                                       |
| `docs/roadmap.md` carries `merge=ours` in `.gitattributes` and is generated from `docs/roadmap.d/`                                                                             | Never hand-edit the aggregate. Edit the shard, regenerate.                                                                                                                                         |
| The eleven member skill directories all exist under `agents/skills/claude-code/`                                                                                               | Every `depends_on` entry resolves; `references.test.ts` will pass.                                                                                                                                 |
| `docs/knowledge/decisions/` has no index file to update (only a `README.md` describing the format)                                                                             | Adding ADR 0091 required no index edit, and none is owed now.                                                                                                                                      |

---

## File Map

- CREATE `agents/skills/claude-code/fleet-command/skill.yaml`
- CREATE `agents/skills/claude-code/fleet-command/SKILL.md`
- CREATE `agents/skills/codex/fleet-command` (symlink → `../claude-code/fleet-command`)
- CREATE `agents/skills/cursor/fleet-command` (symlink → `../claude-code/fleet-command`)
- CREATE `agents/skills/gemini-cli/fleet-command` (symlink → `../claude-code/fleet-command`)
- CREATE `.claude-plugin/commands/fleet-command.md` (generated — never hand-edit)
- CREATE `.cursor-plugin/commands/fleet-command.md` (generated — never hand-edit)
- CREATE `.gemini-extension/commands/fleet-command.toml` (generated — never hand-edit)
- CREATE `.antigravity-extension/commands/fleet-command.toml` (generated — byte-identical to the gemini TOML)
- CREATE `.changeset/fleet-command.md`
- MODIFY `docs/reference/fleet-family.md` (new conductor-tier section + References entry; **Members table unchanged**)
- MODIFY `docs/reference/skills-catalog.md` (REGENERATED — never hand-edit)
- MODIFY `docs/roadmap.d/fleet-command.md` (`Status:` → `in-progress`)
- MODIFY `docs/roadmap.md` (REGENERATED from the shard — never hand-edit)
- MODIFY `docs/changes/fleet-command/proposal.md` (prettier repair only — Task 1)
- MODIFY `docs/knowledge/decisions/0091-fleet-command-conductor-tier-authority-model.md` (prettier repair only — Task 1; content is **not** re-authored)
- CREATE `docs/changes/fleet-command/plans/2026-08-08-fleet-command-plan.md` (this file)

Nothing else. Anything else appearing in `git status --porcelain` is collateral and must be reverted before committing.

---

## Skeleton

1. Preflight, re-baseline, repair pre-existing format drift (~1 task, ~7 min)
2. Verify the conductor-tier ADR (~1 task, ~6 min)
3. `skill.yaml` (~1 task, ~6 min)
4. `SKILL.md` authored in eight ordered slices (~8 tasks, ~40 min)
5. Authoring gate + prose checkpoint (~1 task, ~7 min)
6. Registration: family-spine conductor-tier section, platform symlinks (~2 tasks, ~9 min)
7. Regeneration: plugin commands, skills catalog, roadmap (~2 tasks, ~10 min)
8. Changeset (~1 task, ~3 min)
9. Full gate sweep, checkpoint, single commit (~1 task, ~9 min)

**Estimated total:** 18 tasks, ~95 minutes. _Skeleton approval: deferred to the invoking human alongside the plan sign-off request._

---

## Tasks

Every task assumes this shell prologue:

```bash
cd /Users/cwarner/Projects/harness-engineering/.git-worktrees/fleet-command
export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"
HARNESS="node packages/cli/dist/bin/harness.js"
PRETTIER="node node_modules/prettier/bin/prettier.cjs"
F="agents/skills/claude-code/fleet-command/SKILL.md"
Y="agents/skills/claude-code/fleet-command/skill.yaml"
```

`node --version` must print `v22.20.0` before anything else runs.

---

### Task 1: Preflight the toolchain, re-baseline the gates, repair the pre-existing format drift

**Depends on:** none | **Files:** `docs/changes/fleet-command/proposal.md`, `docs/knowledge/decisions/0091-fleet-command-conductor-tier-authority-model.md` | **Owns:** `docs/changes/fleet-command/**`

1. Confirm the toolchain (all four must succeed; if any fails, re-run the bootstrap noted beneath):

   ```bash
   node --version                                   # v22.20.0
   test -d node_modules && test -d docs/node_modules && test -d agents/skills/node_modules && echo "deps OK"
   test -x node_modules/.bin/tsx && echo "tsx OK"
   test -f packages/cli/dist/bin/harness.js && echo "cli dist OK"
   ```

   Bootstrap if anything is missing: `pnpm install --frozen-lockfile` then `pnpm build`. Both were verified to succeed here.

2. Confirm the branch position — no merge is expected:

   ```bash
   git fetch origin main --quiet
   git rev-list --left-right --count origin/main...HEAD    # expect "0	1"
   ```

   If it is not `0 1`, **stop** — the catalog and command counts in this plan were computed against `origin/main` at `44296e3fa` and must be re-derived.

3. Record the baselines (these are the numbers Task 18 compares against):

   ```bash
   ls -d agents/skills/claude-code/*/ | wc -l                                   # 787
   grep -m1 -E '^[0-9]+ skills' docs/reference/skills-catalog.md                # "787 skills"
   grep -m1 'Tier 2 — Maintenance' docs/reference/skills-catalog.md            # "(67 skills)"
   for d in .claude-plugin/commands .cursor-plugin/commands \
            .gemini-extension/commands .antigravity-extension/commands; do
     echo "$d $(ls $d | wc -l)"
   done                                                                        # 83 / 84 / 65 / 65
   $HARNESS validate > /tmp/fleet-command-validate-before.txt 2>&1
   grep -m1 -E 'Validation (failed|passed)' /tmp/fleet-command-validate-before.txt   # "390 issues"
   ```

4. **Repair the pre-existing prettier drift** (both files are from the spec commit; the fix is `*em*` → `_em_` and prettier applies it mechanically — do **not** hand-edit prose):

   ```bash
   $PRETTIER --write docs/changes/fleet-command/proposal.md \
                     docs/knowledge/decisions/0091-fleet-command-conductor-tier-authority-model.md
   pnpm format:check ; echo "format exit=$?"        # must now be 0
   git diff --stat                                  # exactly these two files
   ```

   Inspect `git diff` and confirm every hunk is emphasis-marker normalization. If prettier rewraps or reflows anything semantic, stop and report — the ADR is a ratified record and its content is not edited by this plan.

5. No commit.

---

### Task 2: Verify the conductor-tier ADR (review only — never re-author) `[checkpoint:human-verify]`

**Depends on:** Task 1 | **Files:** `docs/knowledge/decisions/0091-fleet-command-conductor-tier-authority-model.md` | **Category:** integration

> This ADR is **already written and committed**. This task verifies it and gets a human read on it. It does **not** rewrite it. A ratified decision record is a historical artifact; the only edit this plan makes to it is Task 1's mechanical prettier repair.

1. Verify the frontmatter and structure mechanically:

   ```bash
   A=docs/knowledge/decisions/0091-fleet-command-conductor-tier-authority-model.md
   sed -n '1,10p' "$A"                       # number: 0091, title, date, status: accepted, tier: large, source:
   grep -n '^## ' "$A"                       # Context / Decision / Consequences / Alternatives Considered / References
   ls docs/knowledge/decisions/ | grep -c '^0091'   # exactly 1 — no number collision
   ```

   Required by `docs/knowledge/decisions/README.md`: `number`, `title`, `date`, `status`, `tier`, `source` in frontmatter, and the three required sections `## Context`, `## Decision`, `## Consequences`. All were confirmed present during planning.

2. Verify every relative link target exists:

   ```bash
   grep -oE '\(0[0-9]{3}-[a-z0-9-]+\.md\)' "$A" | tr -d '()' | while read -r f; do
     test -f "docs/knowledge/decisions/$f" && echo "OK $f" || echo "MISSING $f"
   done
   ```

   Expect four `OK` lines (0087, 0088, 0089, 0090). Any `MISSING` is a blocker.

3. Verify the forward reference this plan is responsible for satisfying:

   ```bash
   grep -n 'First instance' "$A"    # agents/skills/claude-code/fleet-command/SKILL.md
   ```

   That path does not exist yet; Tasks 3–12 create it. Note it and move on — it is a promise this plan keeps, not a defect.

4. Read the ADR against the spec's Decisions 1–10 and confirm the four authority properties in the ADR's `## Decision` are the same four the skill body will state as its Iron Law: **one global budget over observable units**, **derived run order**, **member gates batched but never answered**, **artifact-based lane verification with never-merge**. Any divergence between ADR and spec must be resolved **before** authoring — the skill body must not state a fifth property or drop one of the four.

5. `[checkpoint:human-verify]` — **pause.** In plain text, report: the frontmatter fields, the section list, the four link checks, and the four authority properties as the ADR states them. Ask whether the ADR stands as written before it becomes the anchor for the skill body. **Wait for the reply. Do not proceed on silence.**

---

### Task 3: Author `skill.yaml`

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/fleet-command/skill.yaml`

> **Internal-refs constraint applies.** No `#NNNN` anywhere in this file, including the description, which is copied verbatim into four generated command manifests.

1. `mkdir -p agents/skills/claude-code/fleet-command`
2. Write `$Y` with exactly this shape (the `description` is one line; adjust wording, not structure):

   ```yaml
   name: fleet-command
   version: '1.0.0'
   description: Conductor for the fleet family — one tier above the members, coordinating the fleets themselves rather than fanning out over an item queue. Probes each installed fleet's queue, derives the run as a hybrid dependency DAG (a CI-trustworthiness prerequisite first, the conveyor spine in dependency order, the independent quality sweeps parallel alongside, the land stage terminal), enforces one global leaf-slot budget across every fleet in flight instead of additive per-fleet governors, serializes the lanes whose emissions collide and plans a merge order for the ones that only conflict on generated artifacts, presents each ready fleet's own human CONFIRM verbatim in one batched round per wave without ever answering it, verifies every lane from its emitted artifacts rather than its self-report, and hands back one consolidated report. Never merges.
   stability: static
   cognitive_mode: systematic-orchestrator
   triggers:
     - manual
   platforms:
     - claude-code
     - codex
     - cursor
     - gemini-cli
   tools:
     - Bash
     - Read
     - Glob
     - Grep
   cli:
     command: harness skill run fleet-command
     args:
       - name: path
         description: Project root path
         required: false
       - name: --fleets
         description: Restrict the run to a comma-separated subset of the installed fleets; the selection is confirmed at CONFIRM either way
         required: false
       - name: --slots
         description: 'Global cap on concurrent per-item subagents across every fleet in flight (default: 3, hard max 4) — never the sum of the per-fleet governors'
         required: false
       - name: --max-fleets
         description: 'Cap on how many fleets a single run schedules (default: 6); fleets beyond the cap are reported as shed with their reason'
         required: false
       - name: --wall-clock
         description: 'Wall-clock budget for the run (default: 8h); exhausting it stops scheduling new lanes and reports partial results rather than killing in-flight work'
         required: false
       - name: --report-only
         description: Probe the queues, derive the DAG and the contention map, and present the run plan without dispatching any lane
         required: false
       - name: --dry-run
         description: Run SELECT and CONFIRM only; stop before any lane is dispatched
         required: false
   mcp:
     tool: run_skill
     input:
       skill: fleet-command
       path: string
   type: rigid
   tier: 2
   phases:
     - name: select
       description: <see step 3>
       required: true
     - name: confirm
       description: <see step 3>
       required: true
     - name: dispatch
       description: <see step 3>
       required: true
     - name: verify
       description: <see step 3>
       required: true
     - name: report
       description: <see step 3>
       required: true
   state:
     persistent: false
     files: []
   depends_on:
     - ideate-fleet
     - issue-fleet
     - adr-fleet
     - roadmap-fleet
     - pr-fleet
     - cicd-fleet
     - test-fleet
     - security-fleet
     - cleanup-fleet
     - bug-fleet
     - craft-fleet
   addresses:
     - signal: backlog-pressure
       weight: 0.4
     - signal: drift
       weight: 0.2
   capabilities:
     tools:
       - Bash
       - Read
       - Glob
       - Grep
     network: false
     filesystem: read-write
   ```

3. Write the five phase descriptions as single-line prose (they are rendered into every generated command manifest, so they must read standalone). Each must state its conductor-tier substitution explicitly:
   - **select** — determine which members are installed; probe each one's queue depth through its own report-only or dry-run path rather than reimplementing its selection; drop empty-queue fleets as unscheduled; derive the wave assignment from the fixed dependency shape; build the contention map and the derived merge-order plan; detect run-level forks; degrade the DAG to the members actually present and record the ones that are missing.
   - **confirm** — present the wave DAG, the fleet selection with queue depths, the global budget (slots, one pass per fleet, fleet cap, wall-clock), the contention map with its serialization and merge-order consequences, and the detected forks with recommended defaults, for one run-plan authorization; trimming a fleet re-derives the DAG.
   - **dispatch** — schedule one worktree-isolated lane per scheduled fleet wave by wave, each running the real member skill rather than a reimplementation of it, admitting a lane to its fan-out phase only as a global slot frees, never co-scheduling a serialized pair, presenting each wave's ready fleets' own CONFIRM gates together in one batched round, parking a lane that hits an unforeseen run-level fork while the others continue, and stopping new scheduling on budget exhaustion without killing in-flight lanes.
   - **verify** — confirm each lane from its emitted artifacts: the terminal artifact exists in the form that member's contract specifies, per-item verdicts are present with the references they were drawn from and those references are independently spot-checked, the lane never exceeded its allocation from the global pool, and nothing was merged outside a human-authorized land inside the land member's own gate; all-OS CI is recorded as not-applicable at this tier with its reason and never dropped silently.
   - **report** — emit one consolidated dashboard with a per-lane row, the cross-fleet-deduped filing list, the recommended merge order and its regeneration sequence, the budget accounting, everything the budget shed named with its reason, and an assumptions-made note; never merge and never authorize a land.

4. Verify:

   ```bash
   $PRETTIER --write "$Y" && $PRETTIER --check "$Y"
   $HARNESS skill validate fleet-command ; echo "exit=$?"    # note: fails until SKILL.md exists — expected here
   grep -nE '#[0-9]{1,4}' "$Y"                               # must return nothing
   node -e "const y=require('yaml');const fs=require('fs');const d=y.parse(fs.readFileSync('$Y','utf8'));console.log(d.name,d.type,d.tier,d.depends_on.length)"
   ```

   Expect `fleet-command rigid 2 11`.

5. No commit.

---

### Task 4: SKILL.md slice 1 — h1, summary blockquote, framing, `## When to Use`, `## Flags`

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md`

> **Internal-refs constraint applies to every slice.** Cite the family spine as `docs/reference/fleet-family.md` and the family ADRs **by title only** — _Subagent worktree fan-out (vs the Workflow primitive) for `-fleet` execution_, _The front-load / park-unforeseen interaction model for the `-fleet` family_, _The `pr-fleet` land-stage human-merge-gate model_, _The `adr-fleet` decide-stage batch-sign-off-gate model_, and _The `fleet-command` conductor-tier authority model_. **Never write an ADR number and never write a `#NNNN`.**

Structural model: `agents/skills/claude-code/craft-fleet/SKILL.md` and `agents/skills/claude-code/pr-fleet/SKILL.md`. **Copy the structure, never the content.**

1. Create `$F` starting with:

   ```markdown
   # Fleet Command

   > Conductor for the `-fleet` family — one tier above the members, coordinating the fleets themselves rather than fanning out over an item-queue. …
   ```

   The blockquote is one paragraph and must name, in order: the derived DAG, the **one global** budget, cross-fleet deconfliction, wave-batched-but-never-answered member gates, artifact-based lane verification, the consolidated report, and **never merges**.

2. Write the framing (three paragraphs, no heading):
   - **The gap.** Eleven `-fleet` skills exist, each a competent orchestrator over one SDLC work-queue. What does not exist is anything that can run more than one of them in the same session without the operator personally holding the whole shape in their head.
   - **The three costs.** Fan-out² (the per-fleet cap is per fleet; nothing enforces it across fleets, and a cap each participant honors locally and nobody enforces globally is not a cap); dependency (the conveyor is a chain, so concurrent members consume stale predecessor output while fully serial ones waste the sweeps' genuine parallelism); collision (members write shared generated artifacts, allocate from shared sequences, edit the same regions, and file the same defect four times because none can see the others).
   - **What it is, and the spine it builds on.** The conductor is **Tier 3** of Skills → Pipelines → Fleets → Conductor. Its authority is **coordinator plus global governor, never dictator**. It reuses the shared five-phase skeleton, the worktree-isolated fan-out, the front-load / park-unforeseen interaction model, and the never-silent-merge invariant documented in `docs/reference/fleet-family.md`, and it keeps the family's phase **names** deliberately — with **one stated substitution: at this tier SELECT enumerates fleets and DISPATCH dispatches fleet lanes**, where a member's SELECT enumerates items and its DISPATCH dispatches item subagents. It is **not** a `-fleet` and is deliberately not named one.

3. Write `## When to Use` — a bullet list, positives then `NOT for` negatives. At minimum:
   - Running several fleets in one session where the aggregate load, the dependency order, and the collisions would otherwise be held in the operator's head
   - A periodic full-conveyor or full-maintenance sweep where the members' outputs must arrive as one report rather than eleven piles
   - When the interruption budget matters: one run-plan authorization plus one batched gate round per wave, instead of eleven scattered gates
   - NOT for running a single fleet — invoke that member directly; the conductor's overhead only pays off across several lanes
   - NOT for merging anything — the merge-order plan is advice handed to the land member or the human
   - NOT for answering a member's CONFIRM — batching a gate is scheduling; answering it is the collapse this tier rejects
   - NOT for scheduling a convergence pipeline — pipelines are the primitive a fleet runs, and conducting them directly collapses the tier distinction
   - NOT for re-verifying every item a member produced — the member already verified them to the family standard
   - NOT for adding a member or changing one's behavior

4. Write `## Flags` as a two-column table with exactly the six flags from `skill.yaml` (`--fleets`, `--slots`, `--max-fleets`, `--wall-clock`, `--report-only`, `--dry-run`). The `--slots` row must state **default 3, hard max 4** and that no single fleet is ever allocated more than ~3 of the pool. Add a sentence below the table stating that **one pass per fleet per run is fixed and is deliberately not a flag**.

5. Verify:

   ```bash
   $PRETTIER --write "$F" && $PRETTIER --check "$F"
   head -1 "$F"                                  # "# Fleet Command"
   grep -nE '#[0-9]{1,4}|ADR [0-9]{3,4}' "$F"    # must return nothing
   $HARNESS check-vocabulary ; echo "vocab exit=$?"
   ```

6. No commit.

---

### Task 5: SKILL.md slice 2 — `## Process`, Iron Law, phase map, `### Phase 1: SELECT`

**Depends on:** Task 4 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md`

> **Internal-refs constraint applies.**

1. Append `## Process`, then `### Iron Law`, stated as one bold sentence naming all four properties:

   **GLOBAL BUDGET, DERIVED ORDER, UNTOUCHED GATES, NEVER MERGE — no lane is dispatched outside the global governor; no fleet runs before the fleets it depends on have finished; no member's human gate is answered, skipped, or summarized by the conductor; and nothing is merged.**

   Follow it with two or three paragraphs of rationale: each of the four has an obvious-feeling shortcut ("just this once, run them all", "the spine is probably fine out of order", "that gate's answer is clearly yes", "it's all green, land it"), which is why they are law rather than guidance. State the corollary explicitly: **a quiet run — every fleet reporting an empty queue — is a valid, valuable result**, never a reason to lower a noise floor or widen a queue so a lane produces something, and the conductor is the one actor positioned to apply that pressure at scale.

2. Append the phase diagram in a fenced block, matching the family shape:

   ```
   Phase 1: SELECT --> Phase 2: CONFIRM --> Phase 3: DISPATCH
                                                       |
                                                       v
                        Phase 5: REPORT <-- Phase 4: VERIFY
   ```

3. Append the phase table (`| Phase | Purpose | Exit Condition |`) with the five rows, each stating the conductor-tier unit (fleets and lanes, not items).

4. Append `### Phase 1: SELECT — Enumerate Fleets, Probe Queues, Derive the DAG, Build the Contention Map` with numbered steps:
   1. **Determine which members are installed.** A missing member degrades the DAG to the members present and is **recorded**, never silently dropped.
   2. **Probe each member's queue depth through its own report-only or dry-run path** — never by reimplementing its SELECT. A member whose queue is empty is **unscheduled, not run**, and is reported as such.
   3. **Derive the wave assignment** from the fixed dependency shape — include the five-wave table:

      | Wave                                | Fleets                                                                                                                                              | Why this wave                                                                                                                                                                                                                   |
      | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
      | 0 — prerequisite                    | `cicd-fleet`                                                                                                                                        | Every downstream fleet's VERIFY treats all-OS CI green as its evidence. If the CI signal is itself red or flaky, that evidence is meaningless and every downstream verdict is unreliable. A precondition, not a parallel sweep. |
      | 1 — spine head + independent sweeps | `ideate-fleet` → `issue-fleet` (sequential within the wave); `test-fleet`, `cleanup-fleet`, `bug-fleet`, `security-fleet`, `craft-fleet` (parallel) | Ideation feeds intake. The quality sweeps read standing code and depend on none of the spine, so they are genuinely parallel — subject to the global governor and to deconfliction.                                             |
      | 2 — decide                          | `adr-fleet`                                                                                                                                         | Consumes intake's routed decisions.                                                                                                                                                                                             |
      | 3 — build                           | `roadmap-fleet`                                                                                                                                     | Consumes the ranked queue plus the decisions above it.                                                                                                                                                                          |
      | 4 — terminal                        | `pr-fleet`                                                                                                                                          | Lands what every other lane produced, so it must run last or it lands a stale subset.                                                                                                                                           |

      State that a wave with no members **collapses rather than blocking**, and that excluding a fleet at CONFIRM **re-derives its dependents**.

   4. **Build the contention map and the derived merge-order plan** — cross-reference the `### The Contention Map` section (Task 7).
   5. **Detect run-level forks** to surface at CONFIRM with recommended defaults.
   6. **Build the records.** Append both, in fenced blocks:

      ```
      FleetLane {
        member,        // the fleet this lane runs
        wave,          // derived wave index
        dependsOn,     // the lanes that must finish first
        queueDepth,    // probed via the member's own report-only path
        state,         // "scheduled" | "running" | "parked" | "unscheduled"
        slots,         // leaf slots allocated from the global pool
        artifacts,     // emitted PRs / filed items / drafted ADRs / shortlists
        verdictRefs,   // per-item verdict references the conductor spot-checks
        verdict,       // "verified" | "parked" | "rejected" | "unscheduled" | "quiet"
        parkedForks,   // unforeseen run-level forks this lane parked on
      }
      ```

      ```
      RunPlan {
        waves,         // the wave-ordered DAG
        selection,     // the fleets scheduled, with queue depths
        budget,        // { slots, passesPerFleet: 1, maxFleets, wallClock }
        contention,    // the contention map (see below)
        mergeOrder,    // derived merge-order plan — advice, never executed
        authorization, // the human's single run-plan approval
      }
      ```

5. Verify: prettier, the internal-refs grep, and `(cd agents/skills && npx vitest run)` (10 files passed).

6. No commit.

---

### Task 6: SKILL.md slice 3 — `### Phase 2: CONFIRM` and `### Phase 3: DISPATCH`

**Depends on:** Task 5 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md`

> **Internal-refs constraint applies.**

1. Append `### Phase 2: CONFIRM — The Single Up-Front Run-Plan Authorization ` + `` `[checkpoint:human-verify]` ``. Numbered steps presenting, **together, in one surface**: the wave DAG; the fleet selection with probed queue depths and the unscheduled empty-queue fleets; the **global budget** (slot cap with its default 3 / hard max 4, one pass per fleet, fleet cap, wall-clock); the **contention map** with its serialization and merge-order consequences; and the detected forks with recommended defaults. State that the human approves, trims fleets, or re-tunes the budget **once**, that trimming **re-derives the DAG**, and that `--dry-run` stops here while `--report-only` presents this surface and dispatches nothing.

   Add the paragraph that explains why this gate is a **run-plan** authorization and not a batch approval: at this tier the human is authorizing a **schedule and a budget**, not the work — the work's own approvals still belong to each member's gate and arrive later, per wave. Conflating the two would be the dictator design.

2. Append `### Phase 3: DISPATCH — Wave-by-Wave Lane Scheduling Under the Global Governor` with numbered steps:
   1. **One worktree-isolated lane per scheduled fleet**, each running the **real** member skill for its stage — never a reimplementation of what that fleet does. The artifacts the real member leaves behind are exactly what VERIFY checks for.
   2. **The governor allocates leaf slots from one global pool** — default 3, hard max 4, and no single fleet ever allocated more than the family's own per-fleet cap of ~3 of that pool. State the unit argument explicitly: the scarce resource is consumed by the **leaf** subagents a member's DISPATCH fans out, not by a member's cheap select/confirm/verify/report phases, so **a fleet in a cheap phase holds no slot** — which is what lets several lanes be genuinely in flight while the aggregate load stays at single-fleet scale. Capping _fleets_ instead would be the wrong unit; summing per-fleet governors is the failure mode this skill exists to prevent. **Never raise the cap to "go faster."**
   3. **Serialized pairs from the contention map never share a wave.**
   4. **Each wave's ready fleets present their own CONFIRM gates together, in one batched round.** A member's CONFIRM is presented **verbatim and unmodified**. The conductor **never pre-answers, never defaults, never skips, and never summarizes a member's gate into a yes/no**. If a fleet blocks on its gate, **its lane parks and the other lanes continue**.
   5. **Park the unforeseen.** A lane that hits a genuinely-unforeseen run-level fork parks **that lane** and reports it; the rest of the run continues.
   6. **Budget exhaustion stops scheduling new lanes** and lets in-flight lanes finish or park cleanly — **never killed mid-write** — and the run reports partial results with everything shed named and reasoned.
   7. **Record an assumptions-made note per lane** — the derived wave and why, the budget in force, the contention resolutions applied to it, and the defaults taken.
   8. **Push-path caveat.** A worktree created under a nested agent-config path breaks the local pre-push documentation gate: it self-excludes and scans zero files. Lanes push via the GitHub API or from a non-nested throwaway worktree. **Never `--no-verify`.**

3. Verify: prettier, internal-refs grep, `check-vocabulary` (the word is **subagent**, never `sub-agent`).

4. No commit.

---

### Task 7: SKILL.md slice 4 — `### The Contention Map — Four Collision Classes`

**Depends on:** Task 6 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md`

> **Internal-refs constraint applies.** Name the colliding surfaces **generically** — "the generated skills catalog", "the platform command manifests", "the roadmap aggregate", "the decision-record number sequence" — so the section reads correctly in an adopter project with a different generated-artifact set.

1. Append the section between Phase 3 and Phase 4 (mirroring where `craft-fleet` places its eligibility table). Open with one paragraph: the map is built **before dispatch**, over collision **classes** rather than as a hard-coded playbook, and each class is resolved with the **cheapest sufficient mechanism**.

2. Append the four-row table:

   | Collision class              | Example surface                                                                     | Mechanism                                                                                                                                                  |
   | ---------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | **Generated artifacts**      | the generated skills catalog, the platform command manifests, the roadmap aggregate | **Merge-order plan plus regeneration sequencing**, emitted with the report and handed to the land stage — the conductor plans the order, never executes it |
   | **Allocated sequences**      | decision-record numbers, roadmap shard slugs                                        | **Serialize the writers into different waves**; where two same-wave sweeps would allocate from one sequence, one is deferred to the next wave              |
   | **Same-region source edits** | two sweeps elevating or cleaning the same module                                    | **Serialize the lanes, not the merges** — two fleets rewriting one region produce a semantic conflict no merge order fixes                                 |
   | **Duplicate filings**        | one defect filed independently by several quality sweeps                            | **Cross-fleet dedup at report time** — filings are collated across lanes, near-duplicates grouped into one row citing every lane that raised it            |

3. Append the degradation paragraph, stated as a **success** rather than a caveat: if a collision class is eliminated upstream — for instance by removing derived counters from generated prose and moving regeneration to a post-merge job on the main branch — that row of the map simply comes back **empty**, and the merge-order plan becomes a **no-op rather than an error or a stale playbook**. A coordination mechanism that only made sense against today's conflict shape would need rewriting the moment the underlying tax was fixed; this one shrinks to nothing without breaking.

4. Append the duplicate-filing rationale: this is the class **no single member can see at all** — each sweep files correctly and independently, and one defect arrives as several tracker items, each individually right. Dedup is therefore a conductor-tier product, not a member's oversight.

5. Verify: prettier, internal-refs grep, skills vitest.

6. No commit.

---

### Task 8: SKILL.md slice 5 — `### Phase 4: VERIFY` and `### Phase 5: REPORT`

**Depends on:** Task 7 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md`

> **Internal-refs constraint applies.**

1. Append `### Phase 4: VERIFY — Confirm Each Lane From Its Emitted Artifacts, Never Self-Report`. Open with the seam argument: this is the one place a conductor could plausibly cheat by trusting its children, and the one place duplicating their work would double the cost of the entire run. A fleet reporting "ran, verified 4 items, 3 PRs open" is a **claim**; re-verifying every item duplicates work the member already did to the same standard. Verifying **the lane** from artifacts is the seam that satisfies the invariant without paying for it twice.

   Then the four checks, as numbered steps:
   1. **The terminal artifact exists** in the form that member's contract specifies — the emitted PRs, filed items, drafted decision records, or ranked shortlist actually exist and are reachable.
   2. **The member's VERIFY actually ran** — the lane's report carries a per-item verdict for **every** dispatched item, each with the reference it was drawn from, and the conductor **independently spot-checks those references** rather than reading the verdicts. **A lane reporting outcomes with no per-item verdicts did not run the family standard and is rejected.**
   3. **The invariants held** — the lane never exceeded its allocation from the global pool, and **nothing was merged** by any lane other than a land the human authorized inside the land member's own gate.
   4. **All-OS CI is not applicable at this tier and is recorded as such**, with its reason: the conductor emits no code and opens no PR of its own. Per the family's own rule an inapplicable check is **recorded as not-applicable, never dropped silently** — a skipped check and an inapplicable one must not look alike. The per-lane CI evidence stays inside each member's VERIFY and is spot-checked there.

   Close with the verdict vocabulary and the retry rule: `verified`, `parked`, `rejected` (**retried at most once** for a transient failure), `unscheduled`, `quiet`. A rejected lane is reported and **the run continues**.

2. Append `### Phase 5: REPORT — One Consolidated Dashboard, Never a Merge`. Open with the value argument: the report is the conductor's **entire product** — the value of running many fleets is destroyed if their outputs arrive as separate reports the human must collate by hand, which is the coordination work this tier exists to absorb.

   Then the contents, as numbered steps, including a one-row-per-lane table skeleton:

   | Lane | Wave | Verdict | Emitted | Slots used | Parked forks |
   | ---- | ---- | ------- | ------- | ---------- | ------------ |

   plus: the **cross-fleet-deduped filing list** (one row per defect, citing every lane that raised it); the **recommended merge order with its regeneration notes**; the run's **budget accounting**; **everything the budget shed** — unscheduled fleets, unstarted waves — **named with its reason rather than silently dropped**; and an **assumptions-made note** for the run.

   Close with the two terminal prohibitions: landing is the land member's act under its own human gate, or the human's directly — the conductor **never merges and never authorizes a land on the human's behalf** — and a run whose fleets all report empty queues is reported as **quiet**, a valid outcome.

3. Verify: prettier, internal-refs grep, skills vitest.

4. No commit.

---

### Task 9: SKILL.md slice 6 — `## Harness Integration` and `## Success Criteria`

**Depends on:** Task 8 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md`

> **Internal-refs constraint applies.**

1. Append `## Harness Integration` as a bullet list. At minimum:
   - **`harness skill run fleet-command`** — run the full five-phase conductor pipeline.
   - **The `-fleet` members** — the dispatched unit. Each lane runs the **real** member skill; the conductor reimplements none of them.
   - **Each member's own report-only / dry-run path** — how SELECT probes queue depth without reimplementing a member's selection.
   - **The subagent worktree-isolation primitive** — lane isolation, with its nested-path push caveat.
   - **`gh`** — artifact spot-checks and CI reads during VERIFY. The conductor reads evidence and **never merges**.
   - **`manage_roadmap`** — reads filing state during cross-fleet dedup so one defect arrives as one row.
   - **`harness skill validate fleet-command`** — the authoring-time gate for this skill's own structure and schema.
   - **`docs/reference/fleet-family.md`** — the shared spine this skill builds on and the page that describes the conductor tier above it.

2. Append `## Success Criteria` — the spec's Success Criteria list, adapted to skill voice. Every bullet must be observable. Do not drop: the global cap never exceeded and never additive; the derived order with the CI prerequisite; empty-queue fleets unscheduled; **every member gate presented verbatim and answered only by the human**; one authorization plus at most one batched gate round per wave; the four-class contention map with its stated mechanisms; deconfliction degrading to a no-op without breaking; the run bounded with everything shed named; no lane verdict resting on a self-report; all-OS CI recorded not-applicable with its reason; never merges; never schedules a convergence pipeline; a quiet run is valid; graceful degradation with at most one retry; every report carrying an assumptions-made note.

3. Verify: prettier, internal-refs grep, skills vitest.

4. No commit.

---

### Task 10: SKILL.md slice 7 — `## Gates` and `## Escalation`

**Depends on:** Task 9 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md`

> **Internal-refs constraint applies.**

1. Append `## Gates` — bold-led bullets, each a prohibition with its reason. At minimum:
   - **Never dispatch a lane outside the global governor.** The sum of the per-fleet governors is never the operative limit.
   - **Never raise the slot cap above the hard max to go faster.** Beyond the family's ceiling the compound load produces flaky failures indistinguishable from real ones, and a stormed run is slower once re-runs are counted.
   - **Never run a fleet before the fleets it depends on have finished.** A consumer scheduled early consumes stale output.
   - **Never schedule a fleet with an empty queue.** Report it as unscheduled.
   - **Never answer, default, skip, or summarize a member's CONFIRM.** Presenting it verbatim in a batched round is scheduling; answering it is the collapse this tier rejects.
   - **Never merge, and never authorize a land on the human's behalf.** The merge-order plan is advice attached to the report.
   - **Never mark a lane verified on its self-report.** Terminal artifact, per-item verdicts with spot-checked references, within-allocation, nothing-merged — or it is not verified.
   - **Never drop the all-OS CI check silently at this tier.** Record it as not-applicable with its reason.
   - **Never co-schedule a serialized pair.** Same-region editors are serialized as lanes, not merge-ordered.
   - **Never kill an in-flight lane on budget exhaustion.** Stop scheduling; let in-flight lanes finish or park cleanly.
   - **Never schedule a convergence pipeline directly.** Pipelines are the primitive a fleet runs.
   - **Never manufacture work for a quiet run.** A quiet run is a valid result.
   - **Never `--no-verify`.**

2. Append `## Escalation` — bullets of the form _condition: what to do_. At minimum: a member is missing or errors on its queue probe (degrade the DAG to the members present, record it; if none are available, stop and report); a member blocks on its own gate (park the lane, continue the others, report the parked gate verbatim); a lane exceeds its allocation (reject the lane, report it, do not re-run the fleet); a lane's report carries no per-item verdicts (reject — the family standard did not run); a spot-checked reference does not resolve (reject, retry once, then report as unverifiable); the wall-clock or fleet cap is exhausted (stop scheduling, name everything shed with its reason, report partial results); the contention map is empty (proceed — the merge-order plan is a no-op, which is a success); a lane merged something outside an authorized land (stop the run, report it as a gate violation, do not continue scheduling).

3. Verify: prettier, internal-refs grep, skills vitest.

4. No commit.

---

### Task 11: SKILL.md slice 8 — `## Rationalizations to Reject`, `## Red Flags`, `## Examples`, `## Test Scenarios`

**Depends on:** Task 10 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md`

> **Internal-refs constraint applies — including inside the example transcript.** Use fabricated lane names and generic artifact names; never a real PR or issue number.

1. Append `## Rationalizations to Reject` — a two-column `| Rationalization | Reality |` table, **domain-specific to the conductor tier** (this section is required by the skill structure gate). At minimum, one row each for:
   - "Every fleet honors its own cap, so running six of them is fine" → the aggregate is the storm; a cap nobody enforces globally is not a cap.
   - "The sweeps are independent — I will run them all at once to save wall-clock" → independence of _queues_ is not independence of _load_ or of _shared surfaces_; the governor and the contention map both still apply.
   - "The spine order is probably fine — intake had nothing new anyway" → probably-fine is a derivation, not an observation; run order is derived, and a consumer scheduled early consumes stale output.
   - "That member's gate is obviously a yes; I will approve it and keep the run moving" → answering a member's gate converts a human taste-check into a machine judgment at the tier with the largest blast radius.
   - "Presenting eleven gates is bad UX, so I will summarize them into one approval" → batching is scheduling; summarizing is answering. The gate text is presented verbatim.
   - "The lane reported four verified items and CI green, so the lane is verified" → a self-report is never verification; check the artifact and spot-check the references yourself.
   - "Re-verifying every item is the rigorous choice" → it duplicates work already done to the family standard and roughly doubles the run's cost for no new evidence.
   - "Everything is green and the merge order is right there — I will just land it" → the merge decision is a human act held by the land member's gate; a conductor that merges has removed the review the whole model is built around.
   - "This run produced nothing, so widen a queue or lower a floor so it was not wasted" → a quiet run is a valid result, and the conductor is the one actor positioned to manufacture work at scale.
   - "The token budget is the real constraint, so I will meter tokens" → tokens inside dispatched subagents are not observable; the budget governs slots, passes, fleets, and wall-clock, and says so rather than implying enforcement it cannot perform.

2. Append `## Red Flags` — a two-column `| Flag | Corrective Action |` table, each corrective action starting `STOP.` Cover at minimum: about to raise the slot cap; about to answer a member's gate; about to accept a lane's self-report; about to merge because everything looks green; about to `--no-verify` past a failing push gate.

3. Append `## Examples` — one fenced transcript of a realistic multi-fleet run showing all five phases: SELECT (installed members, probed queue depths, unscheduled empty-queue fleets, the derived waves, the contention map with its resolutions); CONFIRM (the run-plan authorization, a human trimming one fleet and the dependents being re-derived); DISPATCH (lanes admitted as slots free, a batched gate round, one lane parking on its own gate, one lane parking on an unforeseen fork); VERIFY (one lane verified from artifacts, one rejected for missing per-item verdicts and retried once, CI recorded not-applicable at this tier); REPORT (the per-lane table, the deduped filing list, the merge order, the budget accounting, everything shed with its reason). Add a second short prose example: **the contention map comes back empty** and the merge-order plan is a no-op — a success, not a defect.

4. Append `## Test Scenarios` — at least three `###` scenarios, each naming the Gate it exercises and the rationalization it guards against:
   - **Gate — the per-fleet caps are summed instead of pooled.** Two lanes each request 3 leaf slots because "each fleet's own cap allows it." Expected: the global governor admits at most the pool (3, hard max 4) and holds the second lane's fan-out until a slot frees; the run is bounded at single-fleet aggregate load.
   - **Gate — a member's CONFIRM is summarized into the run-plan authorization.** Expected: refused. The run-plan authorization covers the schedule and the budget only; each member's gate is presented verbatim in its wave's batched round and answered only by the human. A blocked gate parks that lane and the others continue.
   - **Gate — a lane is marked verified from its own report.** A lane reports "ran, 4 items verified, 3 PRs open" with no per-item verdict references. Expected: rejected — the family standard did not run — retried once, then reported; the run continues.

5. Verify: prettier, internal-refs grep, skills vitest, `check-vocabulary`.

6. No commit.

---

### Task 12: Authoring gate — validate, tests, internal-refs, vocabulary, markdown safety `[checkpoint:human-verify]`

**Depends on:** Task 11 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md`, `agents/skills/claude-code/fleet-command/skill.yaml`

1. ```bash
   $PRETTIER --write agents/skills/claude-code/fleet-command/ && \
   $PRETTIER --check agents/skills/claude-code/fleet-command/
   ```

2. `$HARNESS skill validate fleet-command` — must exit 0.
3. `(cd agents/skills && npx vitest run)` — must report **10 test files passed**. This covers `structure` (an h1, a matching `skill.yaml`, and the required sections for a **rigid behavioral** skill: `## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`, `## Rationalizations to Reject`, plus `## Gates` and `## Escalation`), `schema`, `references` (all eleven `depends_on` entries resolve), `platform-parity`, `internal-refs`, and `interaction-channel`.
4. Structure spot-check:

   ```bash
   grep -c '^## ' "$F"                      # 11
   grep -n '^## \|^### ' "$F"               # order matches Observable Truth 2
   ```

5. ```bash
   grep -nE '#[0-9]{1,4}|ADR [0-9]{3,4}|pull request #|issue #|roadmap #' "$F" "$Y"
   ```

   Must return **nothing**.

6. `$HARNESS check-vocabulary` — must exit 0.
7. Markdown-safety sweep for the VitePress gate, on the new file only: no **bare angle brackets** outside code fences, no **multi-line inline-code spans**, no unescaped `{{ }}`.
8. `[checkpoint:human-verify]` — **pause and present the finished `SKILL.md` to the human.** The prose is the deliverable; the gates prove structure, not judgment. Ask, in plain text, whether these read correctly before anything is wired into generated artifacts:
   - the Iron Law's four properties and the SELECT/DISPATCH substitution sentence,
   - the leaf-slot unit argument (why fleets in cheap phases hold no slot, and why capping fleets would be the wrong unit),
   - the honest-budget statement (slots / passes / fleets / wall-clock, and **not** tokens),
   - the five-wave DAG and the CI-prerequisite rationale,
   - the four-class contention map and the degrades-to-empty-is-a-success paragraph,
   - the verbatim-gate rule and the batching-is-not-answering distinction,
   - the artifact-based lane verification and the not-applicable CI recording.

   **Wait for the reply. Do not proceed on silence.**

---

### Task 13: Add the conductor-tier section to the family spine page

**Depends on:** Task 12 | **Files:** `docs/reference/fleet-family.md` | **Category:** integration

> This page is repo-internal documentation, **not** a shipped skill surface, so ADR numbers are allowed here (the existing References section already uses them).

1. Insert a new `## The conductor tier` section **after `## Members` and before `## References`**. It must state:
   - What the tier is: `fleet-command` sits **one tier above** the members and coordinates the fleets themselves rather than fanning out over an item-queue. Tier 3 of Skills → Pipelines → Fleets → Conductor.
   - **Why it is not named `-fleet`:** a member fans out over an item-queue into outcomes; the conductor's queue is other orchestrators. It reuses the spine's five phase **names** with one substitution — at that tier SELECT enumerates fleets and DISPATCH dispatches fleet lanes.
   - **The four properties it adds**, as a short list: (1) one **global** leaf-slot budget across every fleet in flight, never the sum of the per-fleet governors; (2) a **derived** hybrid DAG — a CI-trustworthiness prerequisite, the conveyor spine in dependency order, the quality sweeps parallel alongside, the land stage terminal; (3) **cross-fleet deconfliction** over four collision classes, degrading to a no-op when a class is eliminated upstream; (4) member gates **batched by wave and never answered**, lane verification from emitted artifacts, and **never merges**.
   - One sentence stating that the authority model is **referenced, not restated** here.

2. Add a References bullet, after the ADR 0090 entry:

   ```markdown
   - **ADR 0091** — The `fleet-command` conductor-tier authority model (coordinator + global governor above the members).
   ```

3. **Do not touch the Members table** — it stays at eleven rows. **Do not add `fleet-command` to the conveyor sentence** — it is not a stage on the conveyor. If either changes, revert it: the conductor being a member is exactly the tier collapse the section exists to prevent.

4. Verify:

   ```bash
   $PRETTIER --write docs/reference/fleet-family.md && $PRETTIER --check docs/reference/fleet-family.md
   grep -c '^| `' docs/reference/fleet-family.md      # Members table row count unchanged
   git diff --stat docs/reference/fleet-family.md     # exactly one file
   ```

5. No commit.

---

### Task 14: Create the three platform-variant symlinks

**Depends on:** Task 13 | **Files:** `agents/skills/codex/fleet-command`, `agents/skills/cursor/fleet-command`, `agents/skills/gemini-cli/fleet-command` | **Category:** integration

1. ```bash
   for p in codex cursor gemini-cli; do
     ln -s ../claude-code/fleet-command "agents/skills/$p/fleet-command"
   done
   ```

   **Never create a symlink inside any `node_modules`.** These three are the only symlinks this plan creates.

2. Verify they resolve:

   ```bash
   for p in codex cursor gemini-cli; do
     test -L "agents/skills/$p/fleet-command" && readlink "agents/skills/$p/fleet-command"
   done
   ```

   Expect three lines of `../claude-code/fleet-command`.

3. Verify git records them as links, not directories:

   ```bash
   git add agents/skills/codex/fleet-command agents/skills/cursor/fleet-command agents/skills/gemini-cli/fleet-command
   git ls-files -s agents/skills/*/fleet-command      # mode must be 120000 on all three
   ```

4. `(cd agents/skills && npx vitest run)` — `platform-parity` must still pass.
5. No commit.

---

### Task 15: Regenerate the four platform command manifests

**Depends on:** Task 14 | **Files:** `.claude-plugin/commands/fleet-command.md`, `.cursor-plugin/commands/fleet-command.md`, `.gemini-extension/commands/fleet-command.toml`, `.antigravity-extension/commands/fleet-command.toml` | **Category:** integration

> **Generated files — never hand-edit any of them.** Their entire content is derived from `skill.yaml`, which is why the internal-refs constraint on the description and phase text matters here: a leak in `skill.yaml` becomes four leaks in shipped manifests.

1. **Snapshot the counts before touching anything:**

   ```bash
   for d in .claude-plugin/commands .cursor-plugin/commands \
            .gemini-extension/commands .antigravity-extension/commands; do
     echo "$d $(ls $d | wc -l)"
   done   # expect 83 / 84 / 65 / 65
   ```

2. **Regenerate all five targets** (this is the same write-mode path `.husky/pre-commit` itself invokes on drift; it requires `node_modules/.bin/tsx`, verified present in Task 1):

   ```bash
   pnpm generate:plugin:all
   ```

3. **Re-snapshot and check for collateral damage — this step is not optional:**

   ```bash
   for d in .claude-plugin/commands .cursor-plugin/commands \
            .gemini-extension/commands .antigravity-extension/commands; do
     echo "$d $(ls $d | wc -l)"
   done   # expect 84 / 85 / 66 / 66
   git status --porcelain -- .claude-plugin .cursor-plugin .gemini-extension .antigravity-extension
   ```

   Only the four new `fleet-command` files may appear as untracked, and **no pre-existing command file may appear deleted or modified**. **If any count dropped, or any existing file shows as deleted, restore immediately and stop:**

   ```bash
   git checkout -- .claude-plugin .cursor-plugin .gemini-extension .antigravity-extension
   ```

   then report before retrying. A count that drops means generation produced nothing while the write path had already cleared the directory.

4. **Verify the outputs:**

   ```bash
   diff -q .gemini-extension/commands/fleet-command.toml .antigravity-extension/commands/fleet-command.toml
   grep -nE '#[0-9]{1,4}' .claude-plugin/commands/fleet-command.md \
                          .cursor-plugin/commands/fleet-command.md \
                          .gemini-extension/commands/fleet-command.toml \
                          .antigravity-extension/commands/fleet-command.toml
   pnpm generate:plugin:check ; echo "plugin check exit=$?"     # 0
   ```

   The `diff -q` must be silent (byte-identical), the grep must return nothing, and the check must exit 0.

5. No commit.

---

### Task 16: Regenerate the skills catalog, flip the roadmap shard, regenerate the aggregate

**Depends on:** Task 15 | **Files:** `docs/reference/skills-catalog.md`, `docs/roadmap.d/fleet-command.md`, `docs/roadmap.md` | **Category:** integration

1. **Regenerate the catalog (never hand-edit it):**

   ```bash
   node scripts/generate-docs.mjs
   $PRETTIER --write "docs/reference/*.md"
   git diff --stat docs/reference/
   ```

   Expect `skills-catalog.md` plus `fleet-family.md` (from Task 13) only. If `cli-commands.md` or `mcp-tools.md` also changed, `git checkout --` them and report it — nothing in this plan touches the CLI or MCP surface.

2. **Verify the catalog content and counts:**

   ```bash
   grep -qF '### fleet-command' docs/reference/skills-catalog.md && echo "catalog entry OK"
   grep -m1 -E '^[0-9]+ skills' docs/reference/skills-catalog.md      # "788 skills"
   grep -m1 'Tier 2 — Maintenance' docs/reference/skills-catalog.md  # "(68 skills)"
   grep -c '^### ' docs/reference/skills-catalog.md                   # 788
   ls -d agents/skills/claude-code/*/ | wc -l                         # 788 — must equal the header
   node scripts/generate-docs.mjs --check ; echo "gendocs exit=$?"    # 0
   ```

   The header count, the `###` entry count, and the skill-directory count must be the **same number**. A header that disagrees with the entry list is exactly the drift a previous hand-correction introduced; do not hand-fix it — if they disagree, regeneration ran against a different tree and must be re-run here.

3. **Flip the roadmap shard** `docs/roadmap.d/fleet-command.md` — **one field only**, leaving `slug`, `milestone`, `order: 15`, `Spec`, `Summary`, `Plan`, `Assignee`, and `External-ID` untouched (`Plan` already points at this file):
   - `- **Status:** planned` → `- **Status:** in-progress`

4. **Regenerate the aggregate (never hand-edit `docs/roadmap.md` — it is `merge=ours` and generated):**

   ```bash
   $HARNESS roadmap regen
   git diff --stat docs/roadmap.md docs/roadmap.d/fleet-command.md
   grep -n -A4 '^### fleet-command' docs/roadmap.md | head -12   # Status: in-progress
   $PRETTIER --check docs/roadmap.md docs/roadmap.d/fleet-command.md
   ```

5. No commit.

---

### Task 17: Add the changeset

**Depends on:** Task 16 | **Files:** `.changeset/fleet-command.md` | **Category:** integration

> **Internal-refs constraint applies.** A changeset body is published verbatim in the release changelog. No `#NNNN`, no PR reference, no ADR number.

1. Create `.changeset/fleet-command.md`:

   ```markdown
   ---
   '@harness-engineering/cli': minor
   ---

   Add `fleet-command` — the **conductor** of the `-fleet` family, one tier above the members and deliberately not named `-fleet`: it coordinates the fleets themselves rather than fanning out over an item-queue. …
   ```

   The body (two short paragraphs, matching the `adr-fleet` changeset's shape) must name: the derived hybrid DAG with its CI-trustworthiness prerequisite; the **one global** leaf-slot budget that replaces additive per-fleet governors; cross-fleet deconfliction over four collision classes with its merge-order plan and cross-fleet filing dedup; member gates batched by wave and **never answered**; lane verification from emitted artifacts rather than self-reports; the single consolidated report; and that it **never merges**. Mention that it ships as a self-contained `SKILL.md` + `skill.yaml` with platform variants and the conductor-tier authority decision record.

2. Verify:

   ```bash
   $PRETTIER --write .changeset/fleet-command.md && $PRETTIER --check .changeset/fleet-command.md
   grep -nE '#[0-9]{1,4}' .changeset/fleet-command.md          # must return nothing
   BASE_REF=origin/main node scripts/check-changesets.mjs ; echo "changesets exit=$?"   # 0
   ```

3. No commit.

---

### Task 18: Full gate sweep, human authorization, single commit `[checkpoint:human-verify]`

**Depends on:** Task 17 | **Files:** every path in the File Map

1. **Run the full sweep, in this order:**

   ```bash
   $HARNESS skill validate fleet-command ; echo "skill validate exit=$?"     # 0
   (cd agents/skills && npx vitest run)                                       # 10 files passed
   node scripts/generate-docs.mjs --check ; echo "gendocs exit=$?"            # 0
   pnpm generate:plugin:check ; echo "plugin check exit=$?"                   # 0
   pnpm format:check ; echo "format exit=$?"                                  # 0
   $HARNESS check-vocabulary ; echo "vocab exit=$?"                           # 0
   BASE_REF=origin/main node scripts/check-changesets.mjs ; echo "changesets exit=$?"   # 0
   pnpm docs:build ; echo "docs:build exit=$?"                                # 0
   $HARNESS validate > /tmp/fleet-command-validate-after.txt 2>&1
   grep -m1 -E 'Validation (failed|passed)' /tmp/fleet-command-validate-after.txt   # expect "389 issues"
   grep -c 'claude-code/fleet-command' /tmp/fleet-command-validate-after.txt        # must be 0
   git status --porcelain                                                     # must match the File Map exactly
   ```

   The `harness validate` count must be **389** — the Task 1 baseline of 390 minus the shard advisory Task 16 resolved. Any other delta must be explained, and **no** issue may name a file under `agents/skills/claude-code/fleet-command`. A `docs:build` failure on the new content is almost always a multi-line inline-code span or a bare angle bracket — fix it in the source markdown, re-run prettier, and re-run the build.

2. Final internal-refs sweep across every shipped surface this change touched:

   ```bash
   grep -rnE '#[0-9]{1,4}|ADR [0-9]{3,4}' \
     agents/skills/claude-code/fleet-command/ \
     .claude-plugin/commands/fleet-command.md \
     .cursor-plugin/commands/fleet-command.md \
     .gemini-extension/commands/fleet-command.toml \
     .antigravity-extension/commands/fleet-command.toml \
     .changeset/fleet-command.md
   ```

   Must return **nothing**. This is the hard constraint's last mechanical checkpoint before the artifacts become permanent.

3. `[checkpoint:human-verify]` — present the full `git status --porcelain`, the four command counts (84 / 85 / 66 / 66), the catalog delta (787 → 788, Tier 2 67 → 68), the validate delta (390 → 389), and every gate result. Ask, in plain text, for authorization to commit. **Wait for the reply.**

4. **Commit — one commit, never `--no-verify`:**

   ```bash
   git add agents/skills/claude-code/fleet-command \
           agents/skills/codex/fleet-command agents/skills/cursor/fleet-command \
           agents/skills/gemini-cli/fleet-command \
           .claude-plugin/commands/fleet-command.md .cursor-plugin/commands/fleet-command.md \
           .gemini-extension/commands/fleet-command.toml \
           .antigravity-extension/commands/fleet-command.toml \
           .changeset/fleet-command.md \
           docs/reference/fleet-family.md docs/reference/skills-catalog.md \
           docs/knowledge/decisions/0091-fleet-command-conductor-tier-authority-model.md \
           docs/roadmap.d/fleet-command.md docs/roadmap.md \
           docs/changes/fleet-command
   git commit -m "feat(skills): fleet-command — the conductor coordinating the -fleet family across the SDLC"
   ```

   The pre-commit hook runs `harness ci check`, `lint-staged`, `generate:plugin:check`, and `harness roadmap regen`. Because Tasks 15–16 already removed all drift, it should find none. **If it reformats a file, re-`git add` that file and re-commit.** If it reports plugin drift, inspect what changed before letting it regenerate. If the commit hangs (the known local graph-schema-rebuild symptom), stop and escalate; do not bypass the hook.

---

## Notes for the executor

- **This is skill authoring — markdown instructions, not TypeScript.** There is no code-level TDD. The verification equivalents, in the order they get strict, are: (1) the `agents/skills` vitest suite (`structure`, `schema`, `references`, `platform-parity`, `internal-refs`, `interaction-channel`); (2) `harness skill validate fleet-command`; (3) the `SKILL.md`'s own embedded `## Test Scenarios`; (4) `prettier --check`; (5) `pnpm generate:plugin:check`; (6) `node scripts/generate-docs.mjs --check`.
- **Zero internal references in every shipped artifact.** `SKILL.md`, `skill.yaml`, the four generated manifests, and the changeset all ship outward. Cite the family ADRs and the spine page **by title**. Internal numbers belong in `docs/changes/fleet-command/**`, the commit message, and the PR body — nowhere else.
- **Structural templates, in priority order:** `agents/skills/claude-code/craft-fleet/SKILL.md` (most recent house style, and the closest match for a table-carrying rigid orchestrator) and `agents/skills/claude-code/pr-fleet/SKILL.md` (the member whose gate the conductor must never usurp). **Copy the structure, never the content** — the conductor's queue, budget, DAG, contention map, verification, and terminal act are its own.
- **Compose, do not reimplement.** The queue is the eleven members. Queue depth comes from each member's own report-only path. The lane runs the **real** member skill. Nothing in this skill re-derives a member's selection, re-runs its verification, or restates its gate.
- **The tier distinction is the thing most easily lost.** A conductor that merges, answers a gate, sums the per-fleet caps, or schedules a pipeline directly has collapsed the tier it exists to create. Every one of those has a Gate; when the prose gets long, the Gates are the invariant.
- **Node 22 for every command.** `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"` first, every time. Node 26 breaks `better-sqlite3` (native ABI) and the git hooks.
- **Use the locally-built CLI, never `PATH`.** `which harness` is a published global bundle that validates its own bundled skills and will report success without ever reading `fleet-command`. Use `node packages/cli/dist/bin/harness.js`.
- **Never hand-edit a generated file:** the four command manifests, `docs/reference/skills-catalog.md`, and `docs/roadmap.md`. Edit the source (`skill.yaml`, the skill tree, the roadmap shard) and regenerate.
- **Never hand-create a symlink inside `node_modules`.** If a dependency is missing, run `pnpm install --frozen-lockfile`.
- **Never `--no-verify`** on any git operation. If a push gate fails, push via the GitHub API or from a non-nested worktree.
- **Order of operations is load-bearing:** author → register → regenerate → prettier the regenerated files → confirm `generate-docs --check`, `generate:plugin:check`, and `format:check` all exit 0 → **then** commit, once. Committing mid-plan invites the pre-commit hook to regenerate artifacts underneath you.
- **The advisor's `SKILLS.md`** (`docs/changes/fleet-command/SKILLS.md`) names the exact wave placement for every member and the explicit rejection of conducting pipelines. Read it alongside the spec before Task 4.
