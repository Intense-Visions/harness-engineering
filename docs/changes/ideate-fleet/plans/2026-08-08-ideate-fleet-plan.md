# Plan: ideate-fleet skill (Phase 1 — author, register, validate)

**Date:** 2026-08-08 · **Spec:** `docs/changes/ideate-fleet/proposal.md` · **Tasks:** 15 · **Time:** ~70 min · **Integration Tier:** large

## Goal

Author the `ideate-fleet` claude-code rigid orchestrator skill (`SKILL.md` + `skill.yaml`) — the **head of the `-fleet` conveyor** (ideate → issue → adr → roadmap → pr) — register it in the family spine page, regenerate the shared plugin/catalog/platform artifacts, and pass every local gate. The skill derives a queue of disjoint themes from `STRATEGY.md` tracks and supplied opportunity areas, fans out worktree-isolated subagents that each run the **real** `harness-ideate` pipeline to its ranked artifact, verifies by artifact provenance plus an **independently re-derived ranking**, and terminates in **one curated ranked shortlist for a human to pick from**. Its Iron Law is NOTHING-IS-FILED.

This phase ships **documentation / skill-authoring only** — no TypeScript source changes.

## Observable Truths (Acceptance Criteria)

1. `node packages/cli/dist/bin/harness.js skill validate ideate-fleet` exits 0.
2. `agents/skills/claude-code/ideate-fleet/SKILL.md` contains, in order: `# ` heading, `> ` summary, `## When to Use` (positive + negative bullets), `## Flags`, `## Process` (with `### Iron Law` and five named phase subsections SELECT / CONFIRM / DISPATCH / VERIFY / CURATE-AND-REPORT), `## Harness Integration`, `## Success Criteria`, `## Gates`, `## Escalation`, `## Rationalizations to Reject`, `## Red Flags`, `## Examples`, `## Test Scenarios`.
3. The shipped body carries **no internal roadmap/PR/issue numbers**: `grep -nE '#[0-9]{2,}|PR #' agents/skills/claude-code/ideate-fleet/*` returns nothing.
4. The Iron Law sentence names NOTHING-IS-FILED, enumerates the four forbidden artifacts (issue, roadmap row, spec/plan/ADR, PR), and states that the fleet commits, stages, and pushes nothing; the "a thin theme is a valid result" rule appears in the terminal phase and in `## Gates`.
5. The re-derived-ranking check appears in the VERIFY phase and in `## Gates`, stating that a score mismatch or non-monotonic order is a **rejection, not a re-sort**, that exact ties in any order are accepted, and that all-OS CI is **not applicable** to this member (recorded, not silently dropped).
   5a. The DISPATCH phase names the **COLLECT** step (artifacts copied verbatim out of each worktree into the invoking tree's `docs/ideation/`, hex-suffix collision rule applied at collection) and the **pinned UTC batch date**.
6. `agents/skills/{codex,cursor,gemini-cli}/ideate-fleet` each resolve as symlinks to `../claude-code/ideate-fleet` (`test -L` + `readlink`), recorded by git with mode `120000`.
7. `docs/reference/fleet-family.md` Members table has an `ideate-fleet` row, and the conveyor sentence places `ideate-fleet` at its **head**.
8. `.claude-plugin/commands/ideate-fleet.md`, `.cursor-plugin/commands/ideate-fleet.md`, `.gemini-extension/commands/ideate-fleet.toml`, and `.antigravity-extension/commands/ideate-fleet.toml` exist, and `pnpm generate:plugin:check` exits 0 (all five targets).
9. `node scripts/generate-docs.mjs --check` exits 0 — `docs/reference/skills-catalog.md` carries a `### ideate-fleet` entry and the regenerated counts.
10. `pnpm format:check` passes on every file this change touches.
11. `node packages/cli/dist/bin/harness.js validate` reports **no new issues attributable to ideate-fleet files** versus the recorded baseline (388 issues, exit 1 — pre-existing).
12. `BASE_REF=origin/main node scripts/check-changesets.mjs` exits 0 (no `packages/*/src` change ⇒ no changeset required).
13. `pnpm docs:build` (VitePress) succeeds.
14. `docs/roadmap.d/ideate-fleet.md` exists and `docs/roadmap.md` regenerates from it with no drift (`harness roadmap regen` is a no-op afterwards).

## NFR Targets

No NFR dimension was elicited: this phase produces documentation and skill metadata only — no hot path, no untrusted-input handler, no load-bearing runtime component, no new failure mode. Performance, security, scalability, and resilience all fall back to their standing defaults (`harness check-perf` budgets and `harness check-security` floors run unchanged in CI). **No `category: nfr` tasks are emitted.**

## Uncertainties

- **[RESOLVED]** The roadmap shard `docs/roadmap.d/ideate-fleet.md` and the regenerated `docs/roadmap.md` already exist (written with the spec). Implementation-order item 2's shard half is done; only the `fleet-family.md` half remains.
- **[DECISION — recommend include]** `docs/reference/skills-catalog.md` is **already stale on `origin/main`**: a clean regen bumps `783 skills` → `784` and `Tier 2 — Maintenance (63 skills)` → `(64)` **before** ideate-fleet is added at all (the file already contains 784 `###` entries — only the two count lines are behind). `generate-docs --check` is a blocking CI gate, so main is red on it today. Recommendation: commit the honest regen (`785` / `(65)` after ideate-fleet) and call out the +1 pre-existing correction in the PR body. This mirrors the precedent set by the two most recent sibling members.
- **[ASSUMPTION]** The argument surface is the one the spec's `### Key seams and data` enumerates: `--themes`, `--count`, `--cut`, `--cap`, `--concurrency`, `--lookback`, `--dry-run`, plus the positional `path`. `--report-only` is **not** carried over from the siblings — for a member that already files nothing, "report only" is indistinguishable from a normal run, so exposing it would be a flag that does nothing. The objection policy is confirmed at CONFIRM rather than exposed as a flag.
- **[ASSUMPTION]** `depends_on` = `harness-ideate`, `harness-strategy`, `harness-roadmap-pilot`, `harness-brainstorming`. `harness-brainstorming` is named as the documented downstream a human routes a pick to — the fleet never invokes it.
- **[ASSUMPTION]** `addresses:` signals = `stale-context` (0.3) + `low-coverage-area` (0.2) is **rejected** as invented vocabulary; the field is omitted entirely rather than guessed, since no shipped signal name maps to "the backlog has no strategy-grounded candidates". (`addresses` is optional — `issue-fleet` and `pr-fleet` omit it.)
- **[ASSUMPTION]** Platform symlink set is exactly `codex`, `cursor`, `gemini-cli` (matches every sibling); `antigravity` is a plugin-generation target, not a skill-symlink source.
- **[DEFERRABLE]** Exact prose of phase bodies, example transcript numbers, and Test Scenario narratives. Does not affect task structure.

## Environment Facts (verified during planning — do not re-derive)

| Fact                                                                                                      | Consequence                                                                     |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Default `node` is v26; repo needs 22                                                                      | Every task prefixes `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"` |
| Worktree deps installed via `pnpm install` (7.9 s); `packages/*/dist` symlinked from the parent           | Use `node packages/cli/dist/bin/harness.js` — **do not** rebuild the dist       |
| `dist/` **is** gitignored (`.gitignore:11`)                                                               | The dist symlinks need no `info/exclude` entry                                  |
| The default shell is zsh — unquoted `$VAR` holding a multi-word command does **not** word-split           | Write commands out in full; do not use `HARNESS="node …"` shell variables       |
| `generate-plugin.mjs` write mode `rmSync`s each plugin `commands/` dir                                    | **Never** run write mode here; use the staging recipe in Task 11                |
| Staging recipe verified: it reproduces the committed sibling artifacts **byte-for-byte** on all 4 targets | No hand-authoring of generated command files is needed                          |
| `generate-docs.mjs --check` **writes** `docs/reference/*.md` then diffs                                   | Always `git checkout -- docs/reference/` after a bare check run                 |
| `.husky/pre-commit` runs `pnpm generate:plugin:check` when `agents/skills/` is staged                     | Task 11 must land before any commit that stages `agents/skills/`                |
| Baselines recorded: `harness validate` = 388 issues (exit 1); `pnpm docs:build` = exit 0                  | Task 13 compares against these                                                  |
| No `packages/*/src` change in this phase                                                                  | `check:changesets` passes with no changeset                                     |

## File Map

- CREATE `agents/skills/claude-code/ideate-fleet/skill.yaml`
- CREATE `agents/skills/claude-code/ideate-fleet/SKILL.md`
- CREATE `agents/skills/codex/ideate-fleet` (symlink → `../claude-code/ideate-fleet`)
- CREATE `agents/skills/cursor/ideate-fleet` (symlink → `../claude-code/ideate-fleet`)
- CREATE `agents/skills/gemini-cli/ideate-fleet` (symlink → `../claude-code/ideate-fleet`)
- CREATE `.claude-plugin/commands/ideate-fleet.md` (generated)
- CREATE `.cursor-plugin/commands/ideate-fleet.md` (generated)
- CREATE `.gemini-extension/commands/ideate-fleet.toml` (generated)
- CREATE `.antigravity-extension/commands/ideate-fleet.toml` (generated)
- MODIFY `docs/reference/fleet-family.md` (Members row + conveyor sentence head)
- MODIFY `docs/reference/skills-catalog.md` (regenerated — never hand-edit)
- CREATE `docs/changes/ideate-fleet/proposal.md` (done with the spec commit)
- CREATE `docs/changes/ideate-fleet/SKILLS.md` (done with the spec commit)
- CREATE `docs/roadmap.d/ideate-fleet.md` + MODIFY `docs/roadmap.md` (done with the spec commit)
- CREATE `docs/changes/ideate-fleet/plans/2026-08-08-ideate-fleet-plan.md` (this file)

## Skeleton

1. Spec + roadmap + plan commit (~1 task, ~4 min)
2. `skill.yaml` (~1 task, ~5 min)
3. `SKILL.md` authored in six ordered slices (~6 tasks, ~30 min)
4. Authoring gate + commit (~1 task, ~4 min)
5. Registration: fleet-family row + conveyor head, platform symlinks (~2 tasks, ~8 min)
6. Regeneration: plugin commands, skills catalog (~2 tasks, ~10 min)
7. Repo gates + PR (~2 tasks, ~9 min)

**Estimated total:** 15 tasks, ~70 minutes.

---

## Tasks

Every task assumes this shell prologue:

```
cd /Users/cwarner/Projects/harness-engineering/.git-worktrees/ideate-fleet
export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"
```

Commands are written out in full (zsh does not word-split unquoted command variables).

### Task 1: Commit the spec, roadmap shard, and this plan

**Depends on:** none | **Files:** `docs/changes/ideate-fleet/**`, `docs/roadmap.d/ideate-fleet.md`, `docs/roadmap.md`

1. `node node_modules/prettier/bin/prettier.cjs --write "docs/changes/ideate-fleet/**/*.md" docs/roadmap.d/ideate-fleet.md docs/roadmap.md`
2. `pnpm format:check` — must exit 0.
3. `git add docs/changes/ideate-fleet docs/roadmap.d/ideate-fleet.md docs/roadmap.md`
4. `git commit -m "docs(ideate-fleet): add spec, plan, and roadmap registration"`
   (This commit stages no `agents/skills/` path, so the pre-commit plugin regen does not fire.)

### Task 2: Author `skill.yaml`

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/ideate-fleet/skill.yaml` | **Owns:** `agents/skills/claude-code/ideate-fleet/**`

1. `mkdir -p agents/skills/claude-code/ideate-fleet`
2. Write `skill.yaml` with: `name: ideate-fleet`, `version: '1.0.0'`, a description naming the theme queue / real-`harness-ideate` fan-out / artifact collection / re-derived-ranking verification / curated-shortlist terminal act / **files nothing**, `stability: static`, `cognitive_mode: systematic-orchestrator`, `triggers: [manual]`, `platforms: [claude-code, codex, cursor, gemini-cli]`, `tools: [Bash, Read, Glob, Grep]`, the `cli` block (`harness skill run ideate-fleet` + `path`, `--themes`, `--count`, `--cut`, `--cap`, `--concurrency`, `--lookback`, `--dry-run`), the `mcp` `run_skill` mapping, `type: rigid`, `tier: 2`, the five `phases` (select / confirm / dispatch / verify / curate-and-report), `state: { persistent: false, files: [] }`, `depends_on` per the Uncertainties assumption, and the `capabilities` block (`network: false`, `filesystem: read-write`).
3. Verify: `node -e "console.log(require('yaml').parse(require('fs').readFileSync('agents/skills/claude-code/ideate-fleet/skill.yaml','utf8')).name)"` prints `ideate-fleet`.
4. No commit yet.

### Task 3: `SKILL.md` slice 1 — heading, summary, framing, When to Use, Flags

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/ideate-fleet/SKILL.md`

Write the `# Ideate Fleet` heading, the `> ` one-paragraph summary, three framing paragraphs (the gap: the conveyor has no head; the caution: ideation is low-precision so nothing is filed; the family-spine citation by title), `## When to Use` with positive bullets and NOT-bullets that draw the boundaries against `harness-ideate` (one topic), `harness-roadmap-pilot` (existing roadmap), `issue-fleet` (existing backlog), `harness-brainstorming` (specs), and `harness-strategy` (writing STRATEGY.md), then the `## Flags` table.

### Task 4: `SKILL.md` slice 2 — Iron Law + phase diagram + phase table

**Depends on:** Task 3 | **Files:** same

The Iron Law states NOTHING-IS-FILED and its rationale (low precision × fan-out = manufactured backlog; the human pick is the only gate that converts an idea into work), plus the corollary that a thin theme is a valid result. Then the five-phase ASCII diagram and the purpose/exit-condition table.

### Task 5: `SKILL.md` slice 3 — Phase 1 SELECT and Phase 2 CONFIRM

**Depends on:** Task 4 | **Files:** same

SELECT: `read_strategy` grounding with the three-case degradation, theme composition from tracks + supplied areas, the disjointness requirement and its merge rule, the batch bound, the scoring basis, and the stop-and-report case. CONFIRM: the single up-front round listing themes, count, objection policy, cut, cap, concurrency, and the explicit "nothing will be filed" restatement; `--dry-run` stops here.

### Task 6: `SKILL.md` slice 4 — Phase 3 DISPATCH

**Depends on:** Task 5 | **Files:** same

The per-theme pipeline (GROUND → GENERATE → CRITIQUE → RANK → WRITE via the real `harness-ideate`, then PRESELECT, CROSS-CHECK with its backfill and `novelty-unknown` degradation, and COLLECT), how the two interactive stops are answered from CONFIRM policy, the never-edit-the-artifact rule, the collision rule applied at collection, the concurrency governor, the assumptions-made note, parking the unforeseen, the push-path caveat, and the `Candidate` record block.

### Task 7: `SKILL.md` slice 5 — Phase 4 VERIFY and Phase 5 CURATE-AND-REPORT

**Depends on:** Task 6 | **Files:** same

VERIFY: why two checks and why CI is not applicable; provenance; the re-derived ranking with the bounded-tiebreaker check; the four verdicts and the retry-once rule. CURATE-AND-REPORT: cross-theme dedup backstop, the bounded cut, the shortlist document path and row shape, the pick handoff, the non-shortlisted-outcome reporting, and graceful degradation.

### Task 8: `SKILL.md` slice 6 — Harness Integration, Success Criteria, Gates, Escalation

**Depends on:** Task 7 | **Files:** same

### Task 9: `SKILL.md` slice 7 — Rationalizations to Reject, Red Flags, Examples, Test Scenarios

**Depends on:** Task 8 | **Files:** same

At least eight rationalizations, the strongest being "these ideas are good, file them so they aren't lost", "the shortlist looks thin so pad it", "I'll trust the subagent's ranking", and "I'll answer the objections myself so the ideas score better". Three Test Scenarios, each naming the Gate it exercises.

### Task 10: Authoring gate + first skill commit

**Depends on:** Task 9 | **Files:** none new

1. `node packages/cli/dist/bin/harness.js skill validate ideate-fleet` — must exit 0.
2. `grep -nE '#[0-9]{2,}|PR #' agents/skills/claude-code/ideate-fleet/*` — must return nothing.
3. `node node_modules/prettier/bin/prettier.cjs --write agents/skills/claude-code/ideate-fleet/`
4. `pnpm generate:plugin:check` — must exit 0 **before** committing (this is what keeps the pre-commit hook off its destructive path).
5. `git add agents/skills/claude-code/ideate-fleet && git commit -m "feat(skills): add ideate-fleet — strategy-grounded ideation fan-out at the head of the fleet spine"`

### Task 11: Registration — fleet-family row + conveyor head, platform symlinks

**Depends on:** Task 10 | **Files:** `docs/reference/fleet-family.md`, `agents/skills/{codex,cursor,gemini-cli}/ideate-fleet` | **Category:** integration

1. Edit the conveyor sentence so it reads `ideate-fleet` (ideate) → `issue-fleet` (intake) → … .
2. Add the Members-table row: `| ideate-fleet | ideate | strategy themes / opportunity areas | harness-ideate | curated ranked shortlist (human picks; files nothing) |`.
3. `for p in codex cursor gemini-cli; do ln -s ../claude-code/ideate-fleet agents/skills/$p/ideate-fleet; done`
4. Verify `test -L` + `readlink` for all three, and `git ls-files -s` mode `120000` after `git add`.
5. No commit yet.

### Task 12: Generate the four plugin command manifests (staging recipe — never write mode)

**Depends on:** Task 11 | **Files:** the four generated command files | **Category:** integration

**Do not run `pnpm generate:plugin` / `generate-plugin.mjs` write mode — it `rm -rf`s each plugin `commands/` directory.** Snapshot `ls .claude-plugin/commands | wc -l` (expect 80) before and after; on any drop, `git checkout -- .claude-plugin/commands/`.

1. Claude: stage into `tmp-plugin-claude-commands` via `node packages/cli/dist/bin/harness.js generate-slash-commands --platforms claude-code --skills-dir agents/skills/claude-code --skills-dir-only --output tmp-plugin-claude-commands --yes`, `prettier --write --ignore-path .prettierignore tmp-plugin-claude-commands/harness`, then copy only `ideate-fleet.md` to `.claude-plugin/commands/`.
2. Cursor: same shape with `--platforms cursor --skills-dir agents/skills/cursor --cursor-mode commands`, staging `tmp-plugin-cursor-commands`, copy to `.cursor-plugin/commands/`.
3. Gemini: `--platforms gemini-cli --skills-dir agents/skills/gemini-cli`, staging `tmp-plugin-gemini-commands`, **no prettier** (TOML); copy `ideate-fleet.toml` to **both** `.gemini-extension/commands/` and `.antigravity-extension/commands/`.
4. `rm -rf tmp-plugin-claude-commands tmp-plugin-cursor-commands tmp-plugin-gemini-commands`
5. `pnpm generate:plugin:check` — must exit 0 for all five targets.

### Task 13: Regenerate the skills catalog and commit the generated set

**Depends on:** Task 12 | **Files:** `docs/reference/skills-catalog.md`, `docs/reference/fleet-family.md` | **Category:** integration

1. `node scripts/generate-docs.mjs`
2. `node node_modules/prettier/bin/prettier.cjs --write "docs/reference/*.md"`
3. `git diff --stat docs/reference/` — expect only `skills-catalog.md` (plus the hand-edited `fleet-family.md`). If `cli-commands.md` / `mcp-tools.md` moved, `git checkout --` them and note it.
4. Verify a `### ideate-fleet` entry exists under Tier 2 and the counts read `785 skills` / `Tier 2 — Maintenance (65 skills)` (the +2 includes the +1 pre-existing correction — see Uncertainties).
5. `node scripts/generate-docs.mjs --check` — must exit 0.
6. `git commit -m "chore(generated): register ideate-fleet in the fleet spine, plugin commands, and skills catalog"`

### Task 14: Repo gates

**Depends on:** Task 13 | **Files:** none (gates only)

1. `pnpm format:check` — must exit 0; no ideate-fleet file may appear.
2. `BASE_REF=origin/main node scripts/check-changesets.mjs` — must exit 0.
3. `node packages/cli/dist/bin/harness.js validate` — compare the issue count against the 388 baseline; `grep -c 'ideate-fleet'` on the output must be 0.
4. `pnpm docs:build` — must succeed (watch for multi-line inline-code spans and bare angle brackets in the new prose).
5. `node packages/cli/dist/bin/harness.js roadmap regen && git diff --quiet docs/roadmap.md` — the aggregate must already be current.

### Task 15: Push through the real pre-push gate and open the PR `[checkpoint:human-verify]`

**Depends on:** Task 14 | **Files:** none

1. `git push -u origin feat/ideate-fleet` — the full `.husky/pre-push` gate must pass. **Never `--no-verify`.** If it blocks, fix the cause.
2. Revert any hook-auto-mutated baselines (`coverage-baselines.json`, `benchmark-baselines.json`, `packages/cli/.harness/arch/baselines.json`) with `git checkout --` so they do not pollute the PR.
3. Open the PR against `main` with an **"Assumptions made"** section listing every `[ASSUMPTION]` and `[DECISION]` above, and referencing the tracking issue with `Refs` (not `Closes`).
4. **Do not merge.** Confirm CI is green across all three operating systems before handing back.
