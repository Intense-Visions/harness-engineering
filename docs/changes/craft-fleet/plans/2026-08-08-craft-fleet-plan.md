# Plan: craft-fleet skill (Phase 1 — author, register, regenerate, validate)

**Date:** 2026-08-08 · **Spec:** `docs/changes/craft-fleet/proposal.md` · **Tasks:** 16 · **Time:** ~80 min · **Integration Tier:** large

## Goal

Author the `craft-fleet` claude-code rigid orchestrator skill (`SKILL.md` + `skill.yaml`) — the **ceiling twin of `cleanup-fleet`**, a quality-queue member of the `-fleet` family that sweeps the eleven `-craft` skills' LLM-judgment critique, holds a **CITED-AND-NET-BETTER** bar, and hands back a **tiered** batch (elevation PRs for bounded high-confidence polish, filed roadmap items for structural quality debt) — then register it in the family spine page and the roadmap shard, regenerate the shared plugin/catalog/platform artifacts, and pass every local gate.

This phase ships **documentation / skill-authoring only** — no `packages/**` source changes.

## Observable Truths (Acceptance Criteria)

1. `node packages/cli/dist/bin/harness.js skill validate craft-fleet` exits 0.
2. `agents/skills/claude-code/craft-fleet/SKILL.md` contains, in order: an `# ` h1, a `> ` summary blockquote, `## When to Use`, `## Flags`, `## Process` (containing `### Iron Law` and five named phase subsections SELECT / CONFIRM / DISPATCH / VERIFY / FILE-AND-REPORT), `## Harness Integration`, `## Success Criteria`, `## Gates`, `## Escalation`, `## Rationalizations to Reject`, `## Red Flags`, `## Examples`, `## Test Scenarios` — 11 `^## ` headings total.
3. `agents/skills/claude-code/craft-fleet/skill.yaml` parses against `SkillMetadataSchema` with `type: rigid`, `tier: 2`, `cognitive_mode: systematic-orchestrator`, and every `depends_on` entry resolving to an existing skill directory.
4. The shipped body carries **no internal roadmap/PR/issue numbers**: the `internal-refs` test passes, and `grep -nE '#[0-9]{1,4}|ADR [0-9]{3,4}' agents/skills/claude-code/craft-fleet/*` returns nothing. The family ADRs and the spine page are cited **by title only**.
5. The Iron Law names **CITED-AND-NET-BETTER**, and both halves are stated: no rewrite without a `runId` + `rubricId` + location cite, and nothing ships that a re-critique cannot show as net better.
6. The `SKILL.md` contains the 11-row **craft-domain elevation-eligibility table**, and exactly four domains (`naming-craft`, `code-craft`, `copy-craft`, `test-craft`) carry a non-`Nothing` elevation-eligible surface.
7. The **two-run re-critique protocol** appears with all three of its asymmetric rules: resolved only if absent from **both** runs; a new equal-or-higher-tier finding blocks if it appears in **either** run; disagreement **downgrades to `file`** (never discards). A re-critique that could not run at all is a **rejection**, retried once.
8. VERIFY is stated to own **both** re-critique runs; the DISPATCH subagent runs **none**.
9. `agents/skills/{codex,cursor,gemini-cli}/craft-fleet` each resolve as symlinks to `../claude-code/craft-fleet` (`test -L` plus `readlink` = `../claude-code/craft-fleet`, git mode `120000`).
10. `docs/reference/fleet-family.md` has a `craft-fleet` row in the Members table and names `craft-fleet` in the conveyor sentence alongside the other quality-queue members.
11. `.claude-plugin/commands/craft-fleet.md`, `.cursor-plugin/commands/craft-fleet.md`, `.gemini-extension/commands/craft-fleet.toml`, and `.antigravity-extension/commands/craft-fleet.toml` all exist; the last two are byte-identical.
12. `node scripts/generate-plugin.mjs --target <claude|cursor|gemini|codex|antigravity> --check` each exit 0, and the per-directory command counts are **exactly** `.claude-plugin/commands` 82, `.cursor-plugin/commands` 83, `.gemini-extension/commands` 64, `.antigravity-extension/commands` 64.
13. `node scripts/generate-docs.mjs --check` exits 0; `docs/reference/skills-catalog.md` carries a `### craft-fleet` entry and reads `786 skills` / `Tier 2 — Maintenance (66 skills)`.
14. `docs/roadmap.d/craft-fleet.md` has `**Status:** in-progress` and `**Plan:** docs/changes/craft-fleet/plans/2026-08-08-craft-fleet-plan.md`, and `docs/roadmap.md` is regenerated to match.
15. `(cd agents/skills && npx vitest run)` reports 10 test files passed (baseline 34104 tests; expect a slightly higher count with craft-fleet added).
16. `pnpm format:check` exits 0.
17. `node packages/cli/dist/bin/harness.js check-vocabulary` exits 0 (5 rules — no `sub-agent`, `sub-task`, `code base`, `green field`, `master branch` in the new prose).
18. `BASE_REF=origin/main node scripts/check-changesets.mjs` exits 0 (no publishable package change ⇒ no changeset required).
19. `pnpm docs:build` (VitePress) exits 0.
20. `harness validate` shows **no new issue attributable to a craft-fleet file** versus the recorded baseline (389 issues, exit 1 — pre-existing; see Environment Facts).

## NFR Targets

**All four NFR dimensions were explicitly skipped, deliberately and not by omission.** The deliverable is markdown instruction text plus generated metadata: there is no hot path to benchmark, no untrusted-input parser, no load profile, and no runtime failure mode of its own. The standing defaults stand unchanged — `harness check-perf` budgets and `harness check-security` floors run as configured inside `harness validate` and CI. **No `category: nfr` task is emitted.**

## Uncertainties

- **[RESOLVED — blocking, must be handled first]** The branch is **behind `origin/main`**: `security-fleet` merged as `b4fce38eb` and it touched **both** files this plan edits (`docs/reference/fleet-family.md` — conveyor sentence and Members table; `docs/reference/skills-catalog.md` — regenerated counts). `git merge-tree --write-tree HEAD origin/main` reports a **clean** merge. Task 1 merges it before any authoring, which also removes the pre-existing catalog-count drift (see next item). Not merging first guarantees a conflict and a wrong catalog count.
- **[RESOLVED]** `node scripts/generate-docs.mjs --check` is **red on this branch today** (`783 → 784`, `Tier 2 (63) → (64)`), because `main`'s catalog counts were hand-corrected while the entry list stayed complete. `origin/main` has since regenerated honestly to `785` / `(65)`. After Task 1's merge the baseline is clean, and craft-fleet's regen is a plain `+1` → `786` / `(66)`. **No off-by-one to explain in the PR body** (unlike the two sibling PRs).
- **[RESOLVED]** `docs/roadmap.d/craft-fleet.md` already exists and is committed (`order: 9`, status `planned`). `security-fleet` shipped **without** a roadmap shard, so `order: 9` is uncontested and `docs/roadmap.md` does not conflict. Only the `Status:` and `Plan:` fields change (Task 15).
- **[ASSUMPTION]** Flag set: `--concurrency`, `--domains`, `--report-only`, `--dry-run`, `--file-only`. `--domains` is craft-fleet's own (the eleven-skill selection is its defining CONFIRM input); the other four mirror the siblings. The noise floor and the two caps are confirmed **interactively at CONFIRM**, not exposed as flags — matching how `bug-fleet` handles its caps. If wrong, only Task 2 and the `## Flags` table in Task 3 change.
- **[ASSUMPTION]** `addresses:` signals = `drift` (0.3) + `high-complexity` (0.2). Both are in the shipped vocabulary; the weights sit deliberately below `cleanup-fleet`'s `drift: 0.5` because craft-fleet's queue is advisory judgment, not a rule-based drift count.
- **[ASSUMPTION]** `depends_on` lists all thirteen composed skills — the eleven craft skills plus `harness-refactoring` and `harness-roadmap-pilot`. All thirteen directories were verified to exist, so `references.test.ts` resolves.
- **[ASSUMPTION]** Platform symlink set is exactly `codex`, `cursor`, `gemini-cli` (matches every sibling); `antigravity` is a plugin-generation target that reuses the gemini skill tree, not a skill-symlink source.
- **[DEFERRABLE]** Exact connective prose, the example-transcript numbers, and the Test Scenario narratives. Section order, table shapes, record shapes, and the load-bearing sentences are pinned below; the prose around them is authored at execution time — that is the deliverable's substance, not deferred detail.

## Environment Facts (verified during planning — do not re-derive)

| Fact                                                                                                                                                                     | Consequence                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default `node` on this machine is v26; the repo pin is 22                                                                                                                | Every task prefixes `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"`. Verified `v22.20.0`.                                                                                              |
| This worktree is **fully installed** — `node_modules`, `packages/cli/node_modules`, `agents/skills/node_modules`, `docs/node_modules` all present and real               | No dependency bootstrap task is needed. **Never** hand-create symlinks inside `node_modules`.                                                                                                      |
| `packages/cli/dist/bin/harness.js` is a real built CLI in this worktree                                                                                                  | Use it for every skill/roadmap command. `which harness` is a **global bundle** that validates ~79 of its own skills, not this tree's 785.                                                          |
| `harness validate` baseline: **389 issues, exit 1**                                                                                                                      | Pre-existing (design-token / advisory noise). Task 16 compares the delta, not the absolute.                                                                                                        |
| `pnpm format:check` baseline: **clean, exit 0**                                                                                                                          | Any failure at Task 16 is caused by this change and must be fixed, not tolerated.                                                                                                                  |
| `(cd agents/skills && npx vitest run)` baseline: **10 files, 34104 tests passed, ~5 s**                                                                                  | Fast enough to run after every authoring slice.                                                                                                                                                    |
| `pnpm docs:build` baseline: **exit 0, ~6 s**                                                                                                                             | Unlike the sibling worktrees, VitePress **can** run locally here. Do not defer it to CI.                                                                                                           |
| `node packages/cli/dist/bin/harness.js check-vocabulary` baseline: **clean, 5 rules**                                                                                    | Prose must use `subagent`, `subtask`, `codebase`, `greenfield`, `main branch`.                                                                                                                     |
| `BASE_REF=origin/main node scripts/check-changesets.mjs`: **"No publishable package changes detected."**                                                                 | No changeset file is required or wanted.                                                                                                                                                           |
| `pnpm generate:plugin:check` (all five targets): **exit 0, ~25 s**, leaves no `tmp-plugin-*` residue                                                                     | Safe to run repeatedly. This is the only sanctioned way to touch the plugin generator.                                                                                                             |
| `node scripts/generate-plugin.mjs --target <t>` **without** `--check` is destructive here                                                                                | Verified on a sibling worktree: it emptied `.claude-plugin/commands/` (78 → 0) while exiting 0 and logging `Wrote 78 commands`. **Never run write mode.** Task 13 uses the staging recipe instead. |
| The staging recipe reproduces committed artifacts **byte-for-byte** — verified in this worktree against `bug-fleet` for claude-code, cursor, gemini-cli, and antigravity | Task 13 can be trusted; deviation from the recipe cannot.                                                                                                                                          |
| Staging dirs are only gitignored when named `tmp-plugin-*-commands/` or `tmp-plugin-*-agents/`                                                                           | Use exactly `tmp-plugin-craft-<platform>-commands`. A differently-named dir shows up in `git status`.                                                                                              |
| Prettier must be the repo binary resolved from inside the repo root (`node node_modules/prettier/bin/prettier.cjs`)                                                      | The repo `.prettierrc` sets `singleQuote: true`; a staging dir outside the root produces non-matching double-quoted frontmatter.                                                                   |
| `.husky/pre-commit` runs `pnpm generate:plugin:check` whenever `agents/skills/` is staged, and auto-regenerates on drift                                                 | Commit **once, at the end**, after Tasks 13–15 have already removed all drift. A mid-plan commit invites the hook to rewrite generated files under you.                                            |
| `.husky/pre-commit` also runs `harness roadmap regen` and re-stages `docs/roadmap.md` whenever a shard is staged                                                         | Task 15's manual `roadmap regen` keeps the working tree honest; the hook is the backstop, not the mechanism.                                                                                       |
| `docs/roadmap.md` carries `merge=ours` in `.gitattributes`                                                                                                               | Never hand-edit the aggregate. Edit the shard, regenerate.                                                                                                                                         |
| Baseline command counts **before** the Task 1 merge: claude 80, cursor 81, gemini 62, antigravity 62                                                                     | After the merge (security-fleet): 81 / 82 / 63 / 63. After craft-fleet: **82 / 83 / 64 / 64**.                                                                                                     |
| Baseline skill-dir count before the merge: 784. `origin/main`: 785                                                                                                       | After craft-fleet: **786 skills**, `Tier 2 — Maintenance (66 skills)`.                                                                                                                             |

## File Map

- CREATE `agents/skills/claude-code/craft-fleet/skill.yaml`
- CREATE `agents/skills/claude-code/craft-fleet/SKILL.md`
- CREATE `agents/skills/codex/craft-fleet` (symlink → `../claude-code/craft-fleet`)
- CREATE `agents/skills/cursor/craft-fleet` (symlink → `../claude-code/craft-fleet`)
- CREATE `agents/skills/gemini-cli/craft-fleet` (symlink → `../claude-code/craft-fleet`)
- CREATE `.claude-plugin/commands/craft-fleet.md` (generated — never hand-edit)
- CREATE `.cursor-plugin/commands/craft-fleet.md` (generated — never hand-edit)
- CREATE `.gemini-extension/commands/craft-fleet.toml` (generated — never hand-edit)
- CREATE `.antigravity-extension/commands/craft-fleet.toml` (generated — byte-identical to the gemini TOML)
- MODIFY `docs/reference/fleet-family.md` (Members row + conveyor sentence)
- MODIFY `docs/reference/skills-catalog.md` (REGENERATED — never hand-edit)
- MODIFY `docs/roadmap.d/craft-fleet.md` (`Status:` → in-progress, `Plan:` → this file)
- MODIFY `docs/roadmap.md` (REGENERATED from the shard — never hand-edit)
- CREATE `docs/changes/craft-fleet/plans/2026-08-08-craft-fleet-plan.md` (this file)

Nothing else. Anything else appearing in `git status --porcelain` is collateral and must be reverted before committing.

## Skeleton

1. Merge `origin/main` and re-baseline the gates (~1 task, ~6 min)
2. `skill.yaml` (~1 task, ~6 min)
3. `SKILL.md` authored in seven ordered slices (~7 tasks, ~35 min)
4. Authoring gate + prose checkpoint (~1 task, ~6 min)
5. Registration: fleet-family row, platform symlinks (~2 tasks, ~8 min)
6. Regeneration: plugin commands, skills catalog, roadmap (~3 tasks, ~12 min)
7. Full gate sweep, checkpoint, single commit (~1 task, ~8 min)

**Estimated total:** 16 tasks, ~80 minutes. _Skeleton approval: deferred to the invoking human alongside the plan sign-off request._

---

## Tasks

Every task assumes this shell prologue:

```bash
cd /Users/cwarner/Projects/harness-engineering/.git-worktrees/craft-fleet
export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"
HARNESS="node packages/cli/dist/bin/harness.js"
PRETTIER="node node_modules/prettier/bin/prettier.cjs"
F="agents/skills/claude-code/craft-fleet/SKILL.md"
```

`node --version` must print `v22.20.0` before anything else runs.

---

### Task 1: Merge `origin/main` and re-baseline the gates

**Depends on:** none | **Files:** `docs/reference/fleet-family.md`, `docs/reference/skills-catalog.md`, `.claude-plugin/commands/**`, `.cursor-plugin/commands/**`, `.gemini-extension/commands/**`, `.antigravity-extension/commands/**` (all inbound from the merge) | **Owns:** the branch tip | **Category:** integration

`security-fleet` (`b4fce38eb`) landed on `origin/main` after this branch forked, and it edits both docs files this plan edits. Merging first is mandatory, not hygiene.

1. `git fetch origin main`
2. `git log --oneline HEAD..origin/main` — expect exactly one commit, `b4fce38eb feat(skills): security-fleet …`. If there are more, re-verify the counts in Observable Truths 12 and 13 before continuing.
3. `git merge origin/main` — expected clean (`git merge-tree --write-tree HEAD origin/main` reported no conflict during planning). **Never `--no-verify`.** If a conflict appears in `docs/reference/fleet-family.md`, resolve it **additively** — keep both `security-fleet` and the existing rows.
4. Re-baseline, and record each number:

   ```bash
   ls .claude-plugin/commands | wc -l          # expect 81
   ls .cursor-plugin/commands | wc -l          # expect 82
   ls .gemini-extension/commands | wc -l       # expect 63
   ls .antigravity-extension/commands | wc -l  # expect 63
   ls agents/skills/claude-code | wc -l        # expect 785
   node scripts/generate-docs.mjs --check; echo "gendocs exit=$?"   # expect 0
   pnpm generate:plugin:check >/dev/null 2>&1; echo "plugin exit=$?" # expect 0
   pnpm format:check >/dev/null 2>&1; echo "format exit=$?"          # expect 0
   $HARNESS validate > /tmp/craft-fleet-validate-baseline.txt 2>&1; echo "validate exit=$?"
   grep -m1 -E 'Validation (failed|passed)' /tmp/craft-fleet-validate-baseline.txt  # record the issue count
   git status --porcelain                       # must be empty
   ```

   `generate-docs --check` **writes before it diffs** — if it exits non-zero, run `git checkout -- docs/reference/` before proceeding.

5. No new commit beyond the merge commit.

---

### Task 2: Author `skill.yaml`

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/craft-fleet/skill.yaml` | **Owns:** `agents/skills/claude-code/craft-fleet/**`

1. `mkdir -p agents/skills/claude-code/craft-fleet`
2. Write `agents/skills/claude-code/craft-fleet/skill.yaml`:

```yaml
name: craft-fleet
version: '1.0.0'
description: Ceiling-raising code-quality elevation sweep — compose the eleven craft skills into ranked (scope, domain) targets, drop the noise floor, route each finding elevate/file/route by a mechanical boundary, confirm one batch with a taste-calibration sample of verbatim findings, fan out worktree-isolated subagents that each run the real harness-refactoring pipeline over one target's cited findings, then independently verify every item by critique provenance plus the step-granular refactoring commit trail plus a two-run re-critique that proves net improvement, and hand back a tiered batch of elevation PRs and filed roadmap items. No cited finding, no rewrite. Never auto-merges.
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
  command: harness skill run craft-fleet
  args:
    - name: path
      description: Project root path
      required: false
    - name: --concurrency
      description: 'Cap on concurrent elevation subagents (default: 2, max recommended 3 — the machine-storm limit)'
      required: false
    - name: --domains
      description: Restrict the sweep to a comma-separated subset of the craft domains; the full enabled set is confirmed at CONFIRM either way
      required: false
    - name: --report-only
      description: Compose the critique, rank the targets, and present the batch with its taste-calibration sample without dispatching elevation subagents or filing items
      required: false
    - name: --dry-run
      description: Run SELECT and CONFIRM only; do not fan out, verify, file, or open PRs
      required: false
    - name: --file-only
      description: File every verified target as a roadmap item carrying its cited finding; never open an elevation PR
      required: false
mcp:
  tool: run_skill
  input:
    skill: craft-fleet
    path: string
type: rigid
tier: 2
phases:
  - name: select
    description: Compose the enabled craft skills over the repository, fold their findings into (scope, craft domain) targets, apply the noise floor, cross-check each target against open elevation PRs and already-filed quality items, route every surviving finding elevate or file or route by the mechanical boundary, and order by tier times impact with roadmap-pilot impact scoring
    required: true
  - name: confirm
    description: Present the enabled craft domains, the ranked targets with their elevate and file split, a taste-calibration sample of verbatim findings, the noise floor, the per-batch caps, the proposed concurrency, and the pinned base SHA for a single up-front human approval that may disable domains or re-tune the floor
    required: true
  - name: dispatch
    description: Fan out worktree-isolated subagents, one per confirmed elevate target, each running the real harness-refactoring pipeline over that target's cited findings and pushing a branch carrying its step-granular commit trail; a target that needs a structural change or whose baseline suite is red downgrades itself to file and reports, and no subagent runs a re-critique
    required: true
  - name: verify
    description: Independently confirm critique provenance for every changed location, the step-granular refactoring commit trail, and net improvement via a two-run re-critique executed here rather than read from the subagent, plus behavior preservation and all-OS CI green — never by subagent self-report
    required: true
  - name: file-and-report
    description: Open one elevation PR per verified target and craft domain without merging, file every verified and every downgraded item as a roadmap item carrying its cite and rubric and location, park routed correctness and security findings for hand-back, and emit a one-row-per-item batch summary including noise-floor drops, over-cap counts, downgrade reasons, cross-check drops, and quiet targets
    required: true
state:
  persistent: false
  files: []
depends_on:
  - naming-craft
  - code-craft
  - copy-craft
  - test-craft
  - docs-craft
  - knowledge-craft
  - spec-craft
  - api-craft
  - cli-ergonomics-craft
  - security-craft
  - harness-design-craft
  - harness-refactoring
  - harness-roadmap-pilot
addresses:
  - signal: drift
    weight: 0.3
  - signal: high-complexity
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

3. `$PRETTIER --write agents/skills/claude-code/craft-fleet/skill.yaml && $PRETTIER --check agents/skills/claude-code/craft-fleet/skill.yaml`
4. `$HARNESS skill validate craft-fleet` — it will report the missing `SKILL.md`. **Every yaml-level error must be absent.**
5. No commit (Task 16 commits everything).

---

### Task 3: SKILL.md slice 1 — heading, summary, framing, `## When to Use`, `## Flags`

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/craft-fleet/SKILL.md`

Create the file with exactly this content mandate, in this order:

1. `# Craft Fleet`
2. A `> ` blockquote summary — one sentence naming: the craft-skill sweep, ranked `(scope, domain)` targets, one up-front confirmation carrying a taste-calibration sample, worktree-isolated subagents running the **real** `harness-refactoring` pipeline, the cited-and-net-better bar, the tiered elevation-PR / filed-roadmap-item terminal, never auto-merges, never trusts a subagent's self-report.
3. Two framing paragraphs:
   - **(a) the gap.** The harness has a complete **floor** and no way to harvest its **ceiling** at batch scale. `cleanup-fleet` works the rule-based entropy queue; `bug-fleet` hunts defects behind a reproduction bar; `test-fleet` chases coverage — every one of them acts on findings a machine can prove. The eleven `-craft` skills encode the taste that says whether working code is any _good_, and they are invoked one file at a time by a human who already suspected something was mediocre. The judgment exists; nothing sweeps with it.
   - **(b) the inversion and the restraint.** `craft-fleet` is the **ceiling twin of `cleanup-fleet`**: it sweeps with the craft skills, ranks what they find, and hands back a **tiered** batch. Because craft findings are advisory LLM judgment **by design**, a fleet that autonomously rewrites subjective "low quality" across a codebase produces churn and bulk PRs that are miserable to review — it would spend the human's attention rather than save it. So this member leans **file-don't-rewrite** for anything structural and reserves direct PRs for safe, bounded, high-confidence polish. It is a **quality-queue** member: it does not sit on the core intake → decide → build → land spine but works the craft-finding queue alongside it.
4. One paragraph citing the shared spine: name `docs/reference/fleet-family.md` and list what it owns (the five-phase skeleton, the concurrency governor, the artifact + all-OS-CI verification discipline, the worktree fan-out with its nested-path push caveat, the front-load / park-unforeseen interaction model, the never-silent-merge invariant), then state what this `SKILL.md` defines for itself (its queue, its elevate-vs-file taxonomy, its cited-and-net-better verification, its dual terminal act, its domain-specific rationalizations). **Cite the family ADRs by title only** — _Subagent worktree fan-out (vs the Workflow primitive) for `-fleet` execution_ and _The front-load / park-unforeseen interaction model for the `-fleet` family_ — and the craft output vocabulary as the _3-axis (tier × impact × confidence) output model_. **No ADR numbers, no issue numbers.**
5. `## When to Use` — at least four positive bullets and at least six `NOT for` bullets:
   - Positive: sweeping a codebase with the craft skills at batch scale, where per-file critique does not scale; turning an existing craft-skill inventory into delivered elevation; when the targets are genuinely independent (one scope, one craft domain, one worktree); when the output must be trustworthy enough to review in bulk — every item arrives with a cited finding.
   - `NOT for`: critiquing a single file (invoke the craft skill directly); rule-based entropy, dead code, or structural drift (`cleanup-fleet`); latent correctness defects (`bug-fleet` — a craft finding that is really a bug is **routed**, not fixed here); coverage gaps (`test-fleet`); landing or merging PRs (`pr-fleet`); applying a security fix (`security-craft` findings are never elevated); converging one target to clean (that is a **pipeline**, not a fleet).
6. `## Flags` — a five-row `Flag | Effect` table matching Task 2's `cli.args` exactly: `--concurrency`, `--domains`, `--report-only`, `--dry-run`, `--file-only`.

Verify:

```bash
$PRETTIER --write "$F" && $PRETTIER --check "$F"
grep -c '^## ' "$F"    # expect 2
```

---

### Task 4: SKILL.md slice 2 — `## Process`, Iron Law, phase map, `### Phase 1: SELECT`

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/craft-fleet/SKILL.md`

Append:

1. `## Process`, then `### Iron Law` with this bolded statement (exact intent; wording may tighten):

   > **CITED-AND-NET-BETTER — no line is rewritten without a cited craft finding (a `runId` + `rubricId` + location from an actual craft-skill run), and nothing is emitted that a re-critique does not show as net better. The fleet never auto-applies a structural, contract-touching, or cross-module change, never elevates a prose surface or a published contract, never publishes a security finding, and never accepts a subagent's self-report as proof its pipeline ran.**

   Follow with a paragraph explaining why: the craft skills are advisory **by design**, so the fleet must not convert advice into authority; the cite is the ceiling analogue of a reproduction — the one thing that cannot be produced by asserting it; and making the elevate boundary mechanical is what keeps it from degrading into "this rewrite felt safe," which is exactly how a taste-driven fleet becomes a churn engine.

   Then the corollary, stated as plainly as the law: **a quiet target is a valid, valuable result.** The incentive to manufacture an elevation so a sweep does not look wasted is the precise failure mode a subjective-judgment fleet must design against.

2. The ASCII phase diagram (same shape as the family spine, terminal named `FILE-AND-REPORT`).
3. A five-row `Phase | Purpose | Exit Condition` table:
   - `1. SELECT` — compose the craft skills into ranked `(scope, domain)` targets — `Ranked Target[] with routing verdicts, cross-check results, and floor/cap counts`
   - `2. CONFIRM` — one human round: domains, batch, taste sample, floor, caps, governor, pinned base SHA — `Approved batch with a pinned base SHA, confirmed domains, floor, and caps`
   - `3. DISPATCH` — subagents run the real `harness-refactoring` over one target's cited findings — `Every elevate target returned a branch, downgraded, parked, or failed (all recorded)`
   - `4. VERIFY` — critique provenance + elevation provenance + two-run re-critique + all-OS CI — `Each item marked verified-elevation / verified-filing / routed / downgraded / rejected`
   - `5. FILE-AND-REPORT` — tiered dual terminal act, batch summary — `Report delivered; nothing merged`
4. `### Phase 1: SELECT — Compose the Craft Skills, Floor, Route, Rank`, numbered:
   1. **Compose the enabled craft skills — reimplement no critique.** Run them over the repository; they already discover their own corpora and emit structured findings carrying `cite.rubricId` under a `runId` reported once per run. A finding's cite is therefore **composed** — the run's `runId` paired with that finding's `rubricId` and location. A missing or erroring craft skill **degrades to the remaining ones and is recorded**, never aborting the batch; if none is available, stop and report — there is nothing to rank.
   2. **Fold findings into targets.** A **target** is one coherent scope (a module, a doc set, a spec set) paired with **exactly one craft domain**. That pairing is what makes the terminal act's one-PR-per-target rule mean "never two craft domains in one PR."
   3. **Apply the noise floor.** Drop, count, and never file or elevate any finding whose `impact` is `small` **and** which is additionally either `tier: aspirational` **or** `confidence: low` — that is, `small` ∧ (`aspirational` ∨ `low`). State the grouping explicitly so the rule cannot be read as (`small` ∧ `aspirational`) ∨ `low`. Dropped findings are **counted and reported**, never silently discarded.
   4. **Cross-check.** Check each target against open elevation PRs and already-filed quality items. An already-addressed target is **dropped and annotated citing the resolving PR or item**, never re-elevated.
   5. **Route every survivor mechanically** — on the finding's own axes plus a surface rule, never on how bad the finding feels:
      - **`elevate`** requires **all** of: `confidence: high`; confined to one target and behavior-preserving; no public-API, observable-contract, or exported-identifier change; no cross-module reach; and the surface is on the elevation-eligible list for its domain.
      - **`file`** — everything else above the floor: any structural change, any contract-touching change, any `medium`/`low`-confidence finding, and every finding in a file-only domain.
      - **`route`** — the finding is really a correctness defect or a genuine security vulnerability. **Park-and-hand-back, not a new mechanism.**
   6. **Enforce the caps after ranking.** Default **20 filed items, 20 elevation PRs** per batch, hard. The cap keeps the highest tier × impact and drops the rest **as over-cap, reported with its count** — never silently. Caps bound **SELECT-time intake**: a target that later downgrades from `elevate` to `file` **converts an already-budgeted elevation slot** rather than adding new intake, so a batch never hands back more than the two caps together allow. Say plainly why the cap, not the floor, is the real guard: filing opens a tracking issue per item, and the surviving `medium`-confidence middle of the distribution is large and legitimately routes to `file`.
   7. **Score and order by tier × impact**, reusing `harness-roadmap-pilot`-style impact scoring; `confidence` is the **routing** axis, not a scoring input. Say why: the 3-axis output model exists precisely because collapsing these axes destroys the information a reviewer needs to prioritize, so inventing a second severity vocabulary would drift from the catalogs being consumed.
5. The `Target` record block:

   ```
   Target {
     domain,      // exactly one craft domain
     id,          // target slug
     scope,       // the files / docs / specs it covers
     findings,    // each: runId, rubricId, location, tier, impact, confidence
     score,       // composite tier x impact
     verdict,     // "elevate" | "file" | "route"
     crossCheck,  // "novel" | "already-addressed" + resolving PR/item
     forks,       // detected decision forks to surface at CONFIRM (may be empty)
   }
   ```

Verify: `$PRETTIER --write "$F" && $PRETTIER --check "$F"`.

---

### Task 5: SKILL.md slice 3 — `### Phase 2: CONFIRM` and `### Phase 3: DISPATCH`

**Depends on:** Task 4 | **Files:** `agents/skills/claude-code/craft-fleet/SKILL.md`

Append:

1. `### Phase 2: CONFIRM — The Single Up-Front Human Gate` carrying the `[checkpoint:human-verify]` marker, presenting **together, in one surface**:
   - The **enabled craft domains** (which of the eleven run at all).
   - The **ranked targets** with their `elevate` / `file` split and their score basis.
   - The **taste-calibration sample** — a handful of **real, verbatim findings**, elevation and file alike, drawn from the actual critique run. State why this member's gate is stronger than every sibling's: counts tell a human how much work is proposed; only a sample tells them whether this sweep's taste matches theirs, and that is the question on which the whole batch's value turns. It is also the cheapest possible place to discover a mismatch — before fan-out rather than at review.
   - The **noise floor** and the **per-batch caps**, both re-tunable here, once.
   - The **proposed concurrency** (default 2, max ~3).
   - The **pinned base SHA** the whole batch works against — the SELECT critique run is pinned to it so VERIFY's branch re-critique is a like-for-like comparison rather than a moving target across a multi-hour batch, and so the green-baseline precondition is evaluated once for the batch.

   State that this is the **only guaranteed touchpoint before batch review**, that the human approves, trims, disables domains, or re-tunes the floor once, and that `--dry-run` stops here.

2. `### Phase 3: DISPATCH — Worktree Fan-Out With a Concurrency Governor`, numbered:
   1. **One worktree-isolated subagent per confirmed `elevate` target.** `file` targets require no fan-out.
   2. **Each runs the real `harness-refactoring` pipeline** over its one target's cited findings — tests green before and after every change, `harness validate` + `harness check-deps` per step, blast radius computed up front, **one small change per commit**, and its own revert-if-no-improvement rule. State explicitly that the anti-churn discipline this fleet needs is already law inside the skill it composes, and that composing it inherits its precondition: **a green baseline suite at the pinned base SHA**.
   3. **The subagent runs no re-critique.** That proof belongs to VERIFY. Its job ends at pushing a branch carrying its commit trail and its cited findings.
   4. **Downgrade rules.** A target whose elevation turns out to need a **structural** change, or whose **baseline suite is red** at the pinned base, **downgrades itself to `file` and reports** rather than applying it. A downgrade is a normal outcome, not a failure — the critique remains valid; only the autonomous rewrite is withheld.
   5. **Governor and caps.** Concurrency capped at the confirmed governor (default 2, max ~3) and at the per-batch caps. Never raise the cap to "go faster."
   6. **An "assumptions made" note per target** — the ranking basis, the routing call, the elevation scope, and what was deliberately left un-elevated.
   7. **Park the unforeseen.** A genuinely-unforeseen fork parks **that one target** and reports it; the batch continues.
   8. **Push-path caveat.** A worktree created under a nested agent-config path breaks the local pre-push documentation gate (it self-excludes and scans zero files). Push via the GitHub API or from a non-nested throwaway worktree. **Never `--no-verify`** — bypassing the gate defeats the verification the fleet depends on.

Verify: `$PRETTIER --write "$F" && $PRETTIER --check "$F"`.

---

### Task 6: SKILL.md slice 4 — the domain-eligibility table

**Depends on:** Task 5 | **Files:** `agents/skills/claude-code/craft-fleet/SKILL.md`

Append, as a subsection inside `## Process` (place it immediately after Phase 3 so the routing rule sits next to the pipeline that applies it), the **elevation-eligibility rule and its 11-row table**.

1. State the single rule first, so the table reads as a consequence rather than eleven judgment calls: **a surface is elevation-eligible only if it lives inside source the test suite exercises** — because the test suite plus `harness check-deps` are what make "behavior-preserving" a checkable claim rather than an assertion — plus one narrower special case for test files themselves, which are the suite rather than exercised by it.

2. The table, verbatim in structure:

   | Craft domain           | Elevation-eligible surface                                                           | Otherwise    |
   | ---------------------- | ------------------------------------------------------------------------------------ | ------------ |
   | `naming-craft`         | Non-exported local identifiers only                                                  | file         |
   | `code-craft`           | Within-unit simplification and control-flow honesty, signature unchanged             | file         |
   | `copy-craft`           | **Internal-facing prose only** — code comments and internal log lines                | file         |
   | `test-craft`           | Test names and test-body clarity, **every assertion expression byte-identical**      | file         |
   | `docs-craft`           | Nothing — prose has no test suite to guard it                                        | file         |
   | `knowledge-craft`      | Nothing — prose has no test suite to guard it                                        | file         |
   | `spec-craft`           | Nothing — prose has no test suite to guard it; a ratified ADR is never edited at all | file         |
   | `harness-design-craft` | Nothing — no craft-driven write path exists                                          | file         |
   | `api-craft`            | Nothing — every surface it critiques is a published contract                         | file         |
   | `cli-ergonomics-craft` | Nothing — every surface it critiques is a published contract                         | file         |
   | `security-craft`       | Nothing — **never elevated**                                                         | file / route |

3. The rationale prose beneath it, covering four points:
   - **Prose domains** (`docs-craft`, `knowledge-craft`, `spec-craft`) are cut deliberately: no skill applies prose-quality edits under a safety envelope, so elevating prose would mean free-hand rewriting text with no mechanical check that it did not make things worse. A **ratified ADR is additionally out of bounds on its own terms** — it is a historical record of a decision, not a document to be improved, and editing one rewrites the past.
   - **`api-craft` / `cli-ergonomics-craft`** critique **published contracts** by definition; renaming a flag or an endpoint is a breaking change wearing a quality argument. **`security-craft`** is never auto-applied because a wrong "improvement" to security posture is worse than the mediocrity it replaced. **`harness-design-craft`** has no reachable write path.
   - **`copy-craft`'s narrowing establishes the general principle: routing follows the surface, not the skill that surfaced the finding.** An error message and a CLI output string are the same bytes on the user's screen whichever domain found them, so they get the same treatment — **filed**, because user-facing output is an observable contract. What stays eligible is genuinely internal: **code comments** (which cannot alter behavior at all) and **internal log lines**. This shrinks the elevation surface; that is the direction this member is designed to err in.
   - **`test-craft`'s narrowing breaks a circularity.** The elevation pipeline proves behavior preservation **with** the test suite, so elevating tests is circular unless the change provably cannot alter what the suite checks. The mechanical rule: every assertion expression **byte-identical** before and after; the **passing-test count unchanged**; and the set of passing test IDs differing **only by the renames the elevation itself applied** (a rename changes a test's ID by construction, so freezing the ID set outright would forbid the very change this row permits). Renaming a test or clarifying its arrange/act body qualifies; **sharpening an assertion does not** — that changes what is asserted, and it is a `file`.

Verify: `$PRETTIER --write "$F" && $PRETTIER --check "$F"`, then `grep -c '| file' "$F"` — expect at least 11 domain rows present.

---

### Task 7: SKILL.md slice 5 — `### Phase 4: VERIFY` and `### Phase 5: FILE-AND-REPORT`

**Depends on:** Task 6 | **Files:** `agents/skills/claude-code/craft-fleet/SKILL.md`

Append:

1. `### Phase 4: VERIFY — Three Independent Proofs, Never Self-Report`, numbered:
   1. **Why three proofs and not one.** No single artifact covers this fleet's two distinct risks — an agent applying its **own** taste, and an elevation that makes things **worse**.
   2. **Critique provenance.** Every changed location maps to a cited finding from a real craft-skill run (`runId` + `rubricId`). A change with no cited finding is the orchestrator's own taste and is **rejected**, however good it looks.
   3. **Elevation provenance.** The step-granular `harness-refactoring` commit trail on the branch: one structural change per commit, suite green throughout. **Absent trail = the real pipeline did not run = rejected.**
   4. **Net-improvement evidence.** Re-run **the same craft skill** over the changed scope on the branch and require that the cited findings are **resolved** _and_ that **no new finding at equal-or-higher tier was introduced**. Tier ordering is the craft catalogs' own — `foundational` outranks `polish` outranks `aspirational` — so "equal-or-higher" is evaluated mechanically rather than by feel. **A re-critique that trades one finding for another is style-thrash, not elevation.**
   5. **The oracle is non-deterministic, and the protocol says so.** A re-critique is an LLM call; two runs over identical code can disagree. State the **two-run protocol biased conservative on both sides** as three explicit rules:
      - A cited finding counts as **resolved only if it is absent from both runs**. Unanimity is required to credit an improvement.
      - A new equal-or-higher-tier finding **blocks if it appears in either run**. One sighting of a regression is enough.
      - When the two runs **disagree**, the elevation is **not proven** — but the underlying critique is still valid, so the item **downgrades to `file`** rather than being discarded. Nothing is lost; only the autonomous rewrite is withheld.

      Then the distinct case: a re-critique that **cannot run at all** (no provider configured, a budget-exceeded prompt collection, an erroring skill) produces **no proof** and is **rejected and retried once** — deliberately a different outcome from the two runs disagreeing, because a re-critique that never ran leaves nothing to re-examine while one that ran and split has already produced its reading. Note the cost call plainly: two runs rather than three, with downgrade-not-discard as the fallback that makes the cheaper protocol safe — an inconclusive oracle costs the batch a filed item, never a bad merge.

   6. **VERIFY owns both runs; the DISPATCH subagent runs none.** A subagent that runs its own re-critique and reports the outcome would leave the orchestrator reading a **claim**, not checking a **proof**. Concentrating both runs here keeps the total at two _and_ makes them independent.
   7. **Plus behavior preservation and CI.** The passing-test count does not decrease; no public-API or observable-contract change; CI green on **all three operating systems** plus the enforce and harness checks. Green on one OS is not green.
   8. **Verdicts:** `verified-elevation`, `verified-filing`, `routed`, `downgraded`, `rejected` (retried **once** first, then reported while the batch continues). State that **degradation never reaches VERIFY** — a proof that cannot be produced here is a rejection, not a graceful skip.

2. `### Phase 5: FILE-AND-REPORT — Tiered Dual Terminal Act, Never Merge`, numbered:
   1. **One elevation PR per verified `(target, craft domain)`** — never one per finding, never mixed across domains — each carrying its cited findings and its assumptions-made note. **Never merged.** State the reasoning: one-PR-per-item granularity is right when each item is a distinct defect, but forty naming fixes as forty PRs is a denial-of-service on review, and forty mixed fixes in one PR forces the reviewer to switch judgment modes line by line. Homogeneous batching gives the reviewer **one kind of taste question at a time over one coherent scope**.
   2. **File each verified `file` item as a roadmap item** — including **every target downgraded from `elevate`**, whose critique remains valid even though its rewrite was withheld — carrying its **cite, rubric, and location** so the eventual builder does not re-derive the critique.
   3. **Park-and-hand-back the routed findings.** A correctness candidate is handed back as a **seed candidate for the correctness queue**; a security vulnerability goes **privately to the human** and is **never opened as a public item** — filing a security finding publicly _is_ disclosure, and this fleet has no disclosure machinery. Note that ordinary `security-craft` posture findings that are not vulnerabilities take the `file` path like any other file-only domain.
   4. **Emit a one-row-per-item batch summary:**

      | Item | Target | Domain | Verdict | PR / Filed item | Cite | Assumptions made |
      | ---- | ------ | ------ | ------- | --------------- | ---- | ---------------- |

      Alongside it, report: **dropped-by-noise-floor** count, **over-cap** count, **downgraded** targets with their downgrade reason, **cross-check drops** citing their resolving PR/item, **routed** items, and **quiet** targets — reported **as quiet, a valid outcome, not a failure**.

   5. **Degrade gracefully in SELECT and DISPATCH only.** A missing or erroring craft skill, a downgraded target, or one target's failed elevation is reported while the batch continues.

Verify: `$PRETTIER --write "$F" && $PRETTIER --check "$F"`.

---

### Task 8: SKILL.md slice 6 — `## Harness Integration` and `## Success Criteria`

**Depends on:** Task 7 | **Files:** `agents/skills/claude-code/craft-fleet/SKILL.md`

Append:

1. `## Harness Integration` — one bullet each, each naming **where** it is used:
   - `harness skill run craft-fleet` — run the full five-phase batch pipeline.
   - The eleven craft skills — composed in SELECT for the queue and re-run **by VERIFY** for net-improvement evidence; name the four with an elevation-eligible surface (`naming-craft`, `code-craft`, `copy-craft`, `test-craft`) and state that the other seven are file-only.
   - `harness-refactoring` — the **single** bounded-elevation pipeline DISPATCH runs; its per-step commit trail is the elevation provenance VERIFY checks.
   - `harness-roadmap-pilot` — its impact-scoring approach is reused in SELECT to order targets by tier × impact.
   - `harness validate` / `harness check-deps` — the per-step gates inside the composed refactoring pipeline that make "behavior-preserving" checkable.
   - `manage_roadmap` — the filing mechanism for the `file` tier; note that it opens a tracking issue per item, which is **why** the per-batch cap is hard.
   - `gh` — cross-check against open PRs and filed items (SELECT), CI reads across all three OS (VERIFY), and elevation-PR creation (FILE-AND-REPORT).
   - `harness skill validate craft-fleet` — the authoring-time gate for this skill's own structure and schema.
   - `docs/reference/fleet-family.md` — the shared `-fleet` spine this skill builds on, stated once for the family.

2. `## Success Criteria` — transcribe the spec's Success Criteria as skill-voice bullets, **minus the two authoring-time ones** (`harness skill validate` and the no-internal-numbers rule, which belong to this plan, not to the shipped skill's runtime criteria). Every one of the following must appear:
   - Tiered batch, every item carrying a cited craft finding.
   - No line changed without a cited craft finding.
   - Every elevation PR carries the step-granular refactoring commit trail.
   - Every elevation confirmed net better by a **two-run re-critique VERIFY itself executes**; cited findings absent from **both** runs; no new equal-or-higher-tier finding in **either**; disagreement downgrades to `file`; a re-critique that could not run is rejected.
   - Behavior preserved; all-OS CI plus enforce and harness green.
   - No structural quality change ever auto-applied — including the mid-flight discovery case and the red-baseline case, both of which downgrade to `file` and report.
   - Only the four domains ever elevate; a ratified ADR is never edited at all.
   - **User-facing output is never elevated, whichever domain surfaced it.**
   - A `test-craft` elevation leaves every assertion byte-identical and the passing-test count unchanged, with the passing test-ID set differing only by the applied renames.
   - Noise-floor drops are **counted, never filed**; caps are never exceeded; everything the cap sheds is **reported as over-cap with its count**.
   - Exactly one up-front human round, presenting a **taste-calibration sample of verbatim findings**, not counts alone.
   - Every emitted PR and filed item carries an assumptions-made note.
   - One PR per target ⇒ never one per finding, never two domains in one PR.
   - Correctness and security findings are **routed** — parked, handed back, never patched inline, never publicly filed.
   - Already-addressed targets dropped with a citation.
   - A quiet target is a valid outcome.
   - Never auto-merges.
   - Degrades gracefully in SELECT; degradation never reaches VERIFY.
   - Concurrency never exceeds the governor.
   - No item marked verified on a subagent self-report.

Verify: `$PRETTIER --write "$F" && $PRETTIER --check "$F"`.

---

### Task 9: SKILL.md slice 7 — `## Gates` and `## Escalation`

**Depends on:** Task 8 | **Files:** `agents/skills/claude-code/craft-fleet/SKILL.md`

Append:

1. `## Gates` — at least twelve bullets, each a hard stop:
   - **No rewrite without a cited craft finding** (`runId` + `rubricId` + location). A changed location that maps to no finding is the orchestrator's own taste ⇒ rejected.
   - **No elevation without the step-granular refactoring commit trail.** Absent trail ⇒ the real pipeline did not run ⇒ rejected.
   - **No elevation without a two-run net-improvement proof.** Resolved requires absence from **both** runs; a new equal-or-higher-tier finding in **either** run blocks.
   - **A re-critique that could not run is a rejection, not a pass** — retried once.
   - **Two runs that disagree downgrade the item to `file`** — never ship the rewrite, never discard the critique.
   - **VERIFY executes both re-critique runs.** A re-critique the dispatch subagent ran and reported is never accepted as proof.
   - **Never auto-apply a structural, contract-touching, cross-module, or exported-identifier change.** Filed, always.
   - **Only `naming-craft`, `code-craft`, `copy-craft`, and `test-craft` ever elevate**, and only on their eligible surfaces. No prose file, no design token, no API or CLI contract surface.
   - **Never edit a ratified ADR.**
   - **Never elevate user-facing output**, whichever domain surfaced it.
   - **A `test-craft` elevation that changes any assertion expression is a `file`.**
   - **Never auto-apply a `security-craft` finding; never publish a routed security vulnerability.**
   - **Never exceed the per-batch caps silently** — over-cap is reported with its count.
   - **Never auto-merge an elevation PR.**
   - **Never exceed the concurrency governor.**
   - **Never manufacture an elevation for a quiet target.**
   - **Never `--no-verify`.**

2. `## Escalation` — at least seven bullets:
   - **A craft skill is missing or errors:** degrade to the remaining ones and record it; if none is available, stop and report — there is nothing to rank.
   - **The re-critique provider is unavailable or the prompt budget is exceeded:** the item is rejected for want of proof and retried once; if it still cannot run, report the item as unverifiable rather than passing it.
   - **The baseline suite is red at the pinned base SHA:** the affected targets do not elevate — they downgrade to `file` and report, since the elevation pipeline's safety net is a green suite.
   - **A target discovers mid-flight that its elevation needs a structural change:** downgrade to `file` and report; do not apply it.
   - **A finding turns out to be a correctness defect:** park it and hand it back as a seed candidate for the correctness queue. Proving a defect requires a reproduction, which this member has no machinery for.
   - **A finding turns out to be a genuine security vulnerability:** hand it to the human privately. Never patch it, never open a public item.
   - **The over-cap count is large:** report it with the batch and let the human re-tune the floor or the caps at the next CONFIRM. Do not quietly raise the cap.
   - **CI red on a subset of operating systems:** report the item failed, naming the OS and check. Never average a mixed result into "mostly green."

Verify:

```bash
$PRETTIER --write "$F" && $PRETTIER --check "$F"
grep -q '^## Gates' "$F" && grep -q '^## Escalation' "$F" && echo "rigid sections OK"
```

---

### Task 10: SKILL.md slice 8 — `## Rationalizations to Reject`, `## Red Flags`, `## Examples`, `## Test Scenarios`

**Depends on:** Task 9 | **Files:** `agents/skills/claude-code/craft-fleet/SKILL.md`

Append:

1. `## Rationalizations to Reject` — a `Rationalization | Reality` table with **9–10 domain-specific rows, none of the universal filler rows**. Required rationalization keys:
   - "The finding is obviously right — applying it without chasing down the cite is bookkeeping"
   - "This doc reads badly and a prose rewrite cannot break anything — elevate it"
   - "The re-critique came back clean on the first run; a second run is a waste of budget"
   - "The two runs disagreed, so throw the item out"
   - "The subagent already re-critiqued its own branch and reported it net better"
   - "It is only a flag name / an exported symbol, and the tests still pass"
   - "This craft finding is really a bug — while I am in the file I will fix it"
   - "Forty naming fixes in one PR is less work for the reviewer than forty PRs"
   - "The target came back quiet — find something so the sweep does not look wasted"
   - "The noise floor already removes the junk, so the cap is belt-and-braces"
   - "The baseline suite has one red test but this rename is trivially safe"
   - "I sharpened the assertion while renaming the test — it is strictly better now"

   Pick the ten that read strongest; each Reality must cite the Gate or Decision that forbids it.

2. `## Red Flags` — a `Flag | Corrective Action` table, five rows, each Corrective Action beginning `STOP.`:
   - "I will mark it verified from the subagent's net-better report"
   - "The re-critique could not run, but the diff looks like a clear improvement"
   - "This exported identifier rename is obviously better and the suite is green"
   - "I have a clean `security-craft` finding — file it so it gets attention"
   - "The pre-push gate is failing in this worktree — I will `--no-verify`"

3. `## Examples`:
   - **(a)** A fenced `harness skill run craft-fleet --concurrency 2` transcript walking all five phases with concrete numbers: craft domains enabled, findings composed, floor drops counted, targets folded and ranked, cap applied with an over-cap count, CONFIRM showing a taste sample and the pinned base SHA, DISPATCH with one downgrade, VERIFY showing one two-run agreement, one two-run disagreement that downgrades, and one rejection for a missing cite, then the terminal split of elevation PRs and filed items, plus one quiet target and one routed finding. **No real advisory IDs, no issue numbers** — use obviously-synthetic slugs.
   - **(b)** A short narrative example: **two re-critique runs disagree.** One run reports the cited `code-craft` finding resolved; the other still sees it. Per the two-run protocol the elevation is **not proven**, so the item **downgrades to `file`** carrying its original cite — the rewrite is withheld, the critique is preserved, and the reviewer's attention is spent on nothing.

4. `## Test Scenarios` — three scenarios, each naming the Gate or Rationalization it exercises:
   1. **Gate — a change with no cited finding is applied because it "obviously improves" the code.** Expected: the cited-finding Gate rejects it as the orchestrator's own taste, however good the diff looks.
   2. **Gate — a single clean re-critique run is accepted as net-improvement proof.** Expected: the two-run protocol requires absence from **both** runs; a one-run pass is not proof. Separately, a re-critique that could not run at all is a **rejection**, retried once — not a pass.
   3. **Gate — a `copy-craft` finding on a user-facing error message is elevated.** Expected: routing follows the **surface**, not the skill; user-facing output is an observable contract and is **filed**, on the same terms as a `cli-ergonomics-craft` finding on the same bytes.

Verify:

```bash
$PRETTIER --write "$F" && $PRETTIER --check "$F"
grep -c '^## ' "$F"    # expect 11
head -1 "$F"           # expect "# Craft Fleet"
```

---

### Task 11: Authoring gate — validate, test suite, internal-refs, vocabulary `[checkpoint:human-verify]`

**Depends on:** Task 10 | **Files:** `agents/skills/claude-code/craft-fleet/SKILL.md`, `agents/skills/claude-code/craft-fleet/skill.yaml`

1. `$PRETTIER --write agents/skills/claude-code/craft-fleet/ && $PRETTIER --check agents/skills/claude-code/craft-fleet/`
2. `$HARNESS skill validate craft-fleet` — must exit 0.
3. `(cd agents/skills && npx vitest run)` — must report **10 test files passed**. This covers `structure` (required sections for a rigid behavioral skill: `## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`, `## Rationalizations to Reject`, plus `## Gates` and `## Escalation`), `schema`, `references` (all thirteen `depends_on` entries resolve), `internal-refs`, and `interaction-channel`.
4. `grep -nE '#[0-9]{1,4}|ADR [0-9]{3,4}|pull request #|issue #' agents/skills/claude-code/craft-fleet/SKILL.md agents/skills/claude-code/craft-fleet/skill.yaml` — must return **nothing**.
5. `$HARNESS check-vocabulary` — must exit 0 (no `sub-agent`, `sub-task`, `code base`, `green field`, `master branch`).
6. Markdown-safety sweep for the VitePress gate, on the new file only: no **bare angle brackets** outside code fences, no **multi-line inline-code spans**, no unescaped `{{ }}`.
7. `[checkpoint:human-verify]` — **pause and present the finished `SKILL.md` to the human.** The prose is the deliverable; the gates prove structure, not judgment. Ask, in plain text, whether these read correctly before anything is wired into generated artifacts:
   - the Iron Law's two halves (cited **and** net better),
   - the noise-floor grouping `small` ∧ (`aspirational` ∨ `low`) and the cap-is-the-real-guard reasoning,
   - the 11-row domain-eligibility table and the "routing follows the surface" principle,
   - the two-run re-critique protocol's three asymmetric rules and the rejected-vs-downgraded distinction,
   - the one-PR-per-target batching rule.

   Wait for the reply. Do not proceed on silence.

---

### Task 12: Register `craft-fleet` in the family spine page

**Depends on:** Task 11 | **Files:** `docs/reference/fleet-family.md` | **Category:** integration

1. In the **conveyor** sentence, add `craft-fleet` to the quality-queue list. After the Task 1 merge the sentence reads `` `cicd-fleet`, `test-fleet`, `security-fleet`, `cleanup-fleet`, and `bug-fleet` work quality queues alongside ``; make it `` `cicd-fleet`, `test-fleet`, `security-fleet`, `cleanup-fleet`, `bug-fleet`, and `craft-fleet` work quality queues alongside ``.
2. Append a row to the **Members** table, after `bug-fleet`:

   | `craft-fleet` | — | craft-skill findings (LLM-judgment quality) | eleven `-craft` skills (critique) → `refactoring` (elevation) | tiered: elevation PRs + filed roadmap items |

3. In **"What each member defines for itself"**, extend the queue parenthetical with `craft-skill judgment findings`.
4. `$PRETTIER --write docs/reference/fleet-family.md && $PRETTIER --check docs/reference/fleet-family.md` (prettier re-pads the whole table — expected, and it is why the diff is larger than one line).
5. `git diff --stat docs/reference/fleet-family.md` — exactly one file.
6. No commit.

---

### Task 13: Create the three platform-variant symlinks

**Depends on:** Task 12 | **Files:** `agents/skills/codex/craft-fleet`, `agents/skills/cursor/craft-fleet`, `agents/skills/gemini-cli/craft-fleet` | **Category:** integration

1. ```bash
   for p in codex cursor gemini-cli; do ln -s ../claude-code/craft-fleet "agents/skills/$p/craft-fleet"; done
   ```

   **Never create a symlink inside any `node_modules`.** These three are the only symlinks this plan creates.

2. Verify:

   ```bash
   for p in codex cursor gemini-cli; do
     test -L "agents/skills/$p/craft-fleet" && readlink "agents/skills/$p/craft-fleet"
   done
   ```

   Expect three lines of `../claude-code/craft-fleet`.

3. Verify git records them as links, not directories:

   ```bash
   git add agents/skills/codex/craft-fleet agents/skills/cursor/craft-fleet agents/skills/gemini-cli/craft-fleet
   git ls-files -s agents/skills/*/craft-fleet    # mode must be 120000 on all three
   ```

4. `(cd agents/skills && npx vitest run)` — the `platform-parity` test must still pass.
5. No commit.

---

### Task 14: Generate the four plugin command files (staging recipe — never write mode)

**Depends on:** Task 13 | **Files:** `.claude-plugin/commands/craft-fleet.md`, `.cursor-plugin/commands/craft-fleet.md`, `.gemini-extension/commands/craft-fleet.toml`, `.antigravity-extension/commands/craft-fleet.toml` | **Category:** integration

> **Do NOT run `node scripts/generate-plugin.mjs --target <t>` or `pnpm generate:plugin*` in write mode.** Verified behavior in a sibling worktree: it `rmSync`s the whole `<pluginDir>/commands/` directory and the replacement files do not land — `.claude-plugin/commands/` went from 78 files to **0**, while exiting **0** and logging `Wrote 78 commands`. Only `--check` mode is safe. The staging recipe below was verified **byte-identical** against the committed `bug-fleet` command files in **this** worktree, for all four outputs.

1. **Snapshot the counts before touching anything:**

   ```bash
   for d in .claude-plugin/commands .cursor-plugin/commands .gemini-extension/commands .antigravity-extension/commands; do
     echo "$d $(ls $d | wc -l)"
   done   # expect 81 / 82 / 63 / 63
   ```

2. **Generate into gitignored staging dirs** (the `tmp-plugin-*-commands` name is required — that exact glob is what `.gitignore` covers — and the dirs must live **inside the repo root** so prettier resolves the repo `.prettierrc` with `singleQuote: true`):

   ```bash
   S=tmp-plugin-craft-claude-commands; rm -rf $S
   ./node_modules/.bin/tsx packages/cli/src/bin/harness.ts generate-slash-commands \
     --platforms claude-code --skills-dir agents/skills/claude-code --skills-dir-only --output $S --yes
   $PRETTIER --write --ignore-path .prettierignore "$S/harness"

   S=tmp-plugin-craft-cursor-commands; rm -rf $S
   ./node_modules/.bin/tsx packages/cli/src/bin/harness.ts generate-slash-commands \
     --platforms cursor --skills-dir agents/skills/cursor --skills-dir-only --cursor-mode commands --output $S --yes
   $PRETTIER --write --ignore-path .prettierignore "$S/harness"

   S=tmp-plugin-craft-gemini-commands; rm -rf $S
   ./node_modules/.bin/tsx packages/cli/src/bin/harness.ts generate-slash-commands \
     --platforms gemini-cli --skills-dir agents/skills/gemini-cli --skills-dir-only --output $S --yes
   ```

   Prettier is deliberately **not** run on the TOML output — the generator's bytes are authoritative there, matching `generate-plugin.mjs`.

3. **Copy exactly four files out, then delete every staging dir:**

   ```bash
   cp tmp-plugin-craft-claude-commands/harness/craft-fleet.md  .claude-plugin/commands/craft-fleet.md
   cp tmp-plugin-craft-cursor-commands/harness/craft-fleet.md  .cursor-plugin/commands/craft-fleet.md
   cp tmp-plugin-craft-gemini-commands/harness/craft-fleet.toml .gemini-extension/commands/craft-fleet.toml
   cp tmp-plugin-craft-gemini-commands/harness/craft-fleet.toml .antigravity-extension/commands/craft-fleet.toml
   rm -rf tmp-plugin-craft-*-commands
   diff -q .gemini-extension/commands/craft-fleet.toml .antigravity-extension/commands/craft-fleet.toml
   ```

4. **Re-snapshot the counts and check for collateral damage:**

   ```bash
   for d in .claude-plugin/commands .cursor-plugin/commands .gemini-extension/commands .antigravity-extension/commands; do
     echo "$d $(ls $d | wc -l)"
   done   # expect 82 / 83 / 64 / 64
   git status --porcelain -- .claude-plugin .cursor-plugin .gemini-extension .antigravity-extension
   ```

   **If any count DROPPED, or any pre-existing command file shows as deleted or modified, restore immediately:**

   ```bash
   git checkout -- .claude-plugin .cursor-plugin .gemini-extension .antigravity-extension
   ```

   then re-run the staging recipe. Only the four new `craft-fleet` files may appear as untracked.

5. **Verify all five targets report no drift:**

   ```bash
   for t in claude cursor gemini codex antigravity; do
     node scripts/generate-plugin.mjs --target "$t" --check >/dev/null 2>&1; echo "$t exit=$?"
   done   # every line must read exit=0
   ```

6. No commit.

---

### Task 15: Regenerate the skills catalog and update the roadmap shard

**Depends on:** Task 14 | **Files:** `docs/reference/skills-catalog.md`, `docs/roadmap.d/craft-fleet.md`, `docs/roadmap.md` | **Category:** integration

1. **Regenerate the catalog (never hand-edit it):**

   ```bash
   node scripts/generate-docs.mjs
   $PRETTIER --write "docs/reference/*.md"
   git diff --stat docs/reference/
   ```

   Expect `skills-catalog.md` and `fleet-family.md` (from Task 12) only. If `cli-commands.md` or `mcp-tools.md` also changed, `git checkout --` them and note it — nothing in this plan touches the CLI or MCP surface.

2. **Verify the catalog content:**

   ```bash
   grep -qF '### craft-fleet' docs/reference/skills-catalog.md && echo "catalog entry OK"
   grep -m1 -E '^78[0-9] skills' docs/reference/skills-catalog.md      # expect "786 skills"
   grep -m1 'Tier 2 — Maintenance' docs/reference/skills-catalog.md    # expect "(66 skills)"
   node scripts/generate-docs.mjs --check; echo "gendocs exit=$?"      # expect 0
   ```

   The delta is a plain `+1` from the Task 1 merge baseline (785 / 65). If it is `+2`, the merge in Task 1 did not happen — stop and re-check.

3. **Update the roadmap shard** `docs/roadmap.d/craft-fleet.md` — two field edits only, leaving `slug`, `milestone`, `order: 9`, `Summary`, and `External-ID` untouched:
   - `- **Status:** planned` → `- **Status:** in-progress`
   - `- **Plan:** —` → `- **Plan:** docs/changes/craft-fleet/plans/2026-08-08-craft-fleet-plan.md`

4. **Regenerate the aggregate (never hand-edit `docs/roadmap.md` — it is `merge=ours` and generated):**

   ```bash
   $HARNESS roadmap regen
   git diff --stat docs/roadmap.md docs/roadmap.d/craft-fleet.md
   grep -n -A3 '^### craft-fleet' docs/roadmap.md | head -12   # Status: in-progress, Plan: <this file>
   $PRETTIER --check docs/roadmap.md docs/roadmap.d/craft-fleet.md
   ```

5. No commit.

---

### Task 16: Full gate sweep, human authorization, single commit `[checkpoint:human-verify]`

**Depends on:** Task 15 | **Files:** every path in the File Map

1. **Run the full sweep, in this order:**

   ```bash
   node packages/cli/dist/bin/harness.js skill validate craft-fleet ; echo "skill validate exit=$?"
   (cd agents/skills && npx vitest run)                     # 10 files passed
   node scripts/generate-docs.mjs --check ; echo "gendocs exit=$?"          # 0
   for t in claude cursor gemini codex antigravity; do
     node scripts/generate-plugin.mjs --target "$t" --check >/dev/null 2>&1; echo "$t exit=$?"
   done                                                     # all 0
   pnpm format:check ; echo "format exit=$?"                # 0
   $HARNESS check-vocabulary ; echo "vocab exit=$?"         # 0
   BASE_REF=origin/main node scripts/check-changesets.mjs ; echo "changesets exit=$?"   # 0
   pnpm docs:build ; echo "docs:build exit=$?"              # 0
   $HARNESS validate > /tmp/craft-fleet-validate-after.txt 2>&1
   grep -m1 -E 'Validation (failed|passed)' /tmp/craft-fleet-validate-after.txt
   grep -c 'craft-fleet' /tmp/craft-fleet-validate-after.txt   # must be 0
   git status --porcelain                                   # must match the File Map exactly
   ```

   The `harness validate` issue count must not exceed the Task 1 baseline; any delta must be explained, and **no** issue may name a `craft-fleet` file. A `docs:build` failure on the new content is almost always a multi-line inline-code span or a bare angle bracket — fix it in the source markdown, re-run prettier, and re-run the build.

2. `[checkpoint:human-verify]` — present the full `git status --porcelain`, the four command counts (82 / 83 / 64 / 64), the catalog count delta (785 → 786, Tier 2 65 → 66), and every gate result. Ask, in plain text, for authorization to commit. **Wait for the reply.**

3. **Commit — one commit, never `--no-verify`:**

   ```bash
   git add agents/skills/claude-code/craft-fleet \
           agents/skills/codex/craft-fleet agents/skills/cursor/craft-fleet agents/skills/gemini-cli/craft-fleet \
           .claude-plugin/commands/craft-fleet.md .cursor-plugin/commands/craft-fleet.md \
           .gemini-extension/commands/craft-fleet.toml .antigravity-extension/commands/craft-fleet.toml \
           docs/reference/fleet-family.md docs/reference/skills-catalog.md \
           docs/roadmap.d/craft-fleet.md docs/roadmap.md \
           docs/changes/craft-fleet
   git commit -m "feat(skills): craft-fleet — ceiling-raising code-quality elevation sweep"
   ```

   The pre-commit hook will run `harness ci check`, `lint-staged`, `generate:plugin:check`, and `harness roadmap regen`. Because Tasks 14 and 15 already removed all drift, it should find none. **If it reformats a file, re-`git add` that file and re-commit.** If it reports plugin drift, do **not** let it "fix" the drift blind — inspect what changed first, because write-mode regeneration is the destructive path. If the commit hangs (the known local graph-schema rebuild symptom), stop and escalate; do not bypass the hook.

---

## Notes for the executor

- **This is skill authoring — markdown instructions, not TypeScript.** There is no code-level TDD. The verification equivalents, in the order they get strict, are: (1) the `agents/skills` vitest suite (`structure`, `schema`, `references`, `platform-parity`, `internal-refs`, `interaction-channel`); (2) `harness skill validate craft-fleet`; (3) the `SKILL.md`'s own embedded `## Test Scenarios`; (4) `prettier --check`; (5) `generate-plugin.mjs --check` across all five targets; (6) `generate-docs.mjs --check`.
- **Structural templates, in priority order:** `agents/skills/claude-code/cleanup-fleet/SKILL.md` (the **floor twin** — closest structural mirror, and craft-fleet's convergence-re-scan ancestor) and `agents/skills/claude-code/bug-fleet/SKILL.md` (the closest **tiered-terminal** analogue and the most recent house style). `agents/skills/claude-code/security-fleet/SKILL.md` arrives with the Task 1 merge and is the newest example of the same shape. **Copy the structure, never the content** — craft-fleet's queue, bar, routing table, verification, and terminal act are its own.
- **Compose, do not reimplement.** The queue is the eleven craft skills. The elevation is `harness-refactoring`. The scoring approach is `harness-roadmap-pilot`'s. The filing is `manage_roadmap`. Nothing in this skill re-derives critique, rubrics, or a severity vocabulary.
- **Node 22 for every command.** `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"` first, every time. Node 26 breaks `better-sqlite3` (native ABI) and the hooks.
- **Use the locally-built CLI, never `PATH`.** `which harness` is `/opt/homebrew/bin/harness` — a published global bundle that validates its own bundled skills and will report success without ever reading `craft-fleet`. Use `node packages/cli/dist/bin/harness.js` (verified to resolve this worktree's `agents/skills/claude-code`).
- **Never run plugin generation in write mode.** Task 14's staging recipe is the only sanctioned path, and it was verified byte-identical here. Snapshot the four counts before and after; if any count drops, `git checkout -- .claude-plugin .cursor-plugin .gemini-extension .antigravity-extension` immediately and re-run the recipe.
- **Never hand-create a symlink inside `node_modules`.** This worktree is fully installed; if a dependency is somehow missing, run `pnpm install --filter <pkg>` instead.
- **Never `--no-verify`** on any git operation, including the Task 1 merge. If a push gate fails, push via the GitHub API or from a non-nested worktree.
- **Order of operations is load-bearing:** author → register → regenerate → prettier the regenerated files → confirm `generate-docs --check`, `generate:plugin:check`, and `format:check` all exit 0 → **then** commit, once. Committing mid-plan invites the pre-commit hook to regenerate artifacts underneath you.
- **Zero internal references in the shipped body.** `SKILL.md` and `skill.yaml` ship verbatim into adopter projects, and `internal-refs.test.ts` greps for `(roadmap|PR|pull request|issue) #NNNN`, `sub-project #N`, and `` `skill-name` (#N) `` shapes. Cite the family ADRs and the craft output model **by title**, never by number, and keep the example transcript free of real advisory IDs.
- **Vocabulary:** `subagent`, `subtask`, `codebase`, `greenfield`, `main branch`. `check-vocabulary` fails on the hyphenated/spaced forms.
- **Keep the `SKILL.md` self-contained.** The spine page is _cited_, but the file must still carry every required section and read correctly in an adopter project that has no `docs/reference/fleet-family.md`.
- **The advisor's `SKILLS.md` is genuinely useful here** (unlike the sibling plans' generic output): `docs/changes/craft-fleet/SKILLS.md` names the exact four elevation-eligible domains, the file-only split, and the `align-design-system` rejection rationale. Read it alongside the spec before Task 3. Tasks 3–10 carry the `harness-skill-authoring` skill as their reference.
- **`docs:build` runs locally in this worktree** (unlike the sibling worktrees where `docs/node_modules` was absent). Do not defer the VitePress gate to CI.
