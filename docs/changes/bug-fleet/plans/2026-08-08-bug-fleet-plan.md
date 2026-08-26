# Plan: bug-fleet skill (Phase 1 — author, register, validate)

**Date:** 2026-08-08 · **Spec:** `docs/changes/bug-fleet/proposal.md` · **Tasks:** 17 · **Time:** ~75 min · **Integration Tier:** large

## Goal

Author the `bug-fleet` claude-code rigid orchestrator skill (`SKILL.md` + `skill.yaml`) — the proactive, standing-code **latent-defect quality-queue** member of the `-fleet` family — register it in the family spine page, regenerate the shared plugin/catalog/platform artifacts, and pass every local gate. The skill composes the existing detection analyses for its queue and the existing review machinery, `harness-tdd`, and `harness-debugging` for its per-area hunt; it holds an Iron Law of REPRODUCTION-REQUIRED, tiers its terminal act into fix PRs and filed issues, and never auto-merges.

This phase ships **documentation / skill-authoring only** — no TypeScript source changes.

## Observable Truths (Acceptance Criteria)

1. `node packages/cli/dist/bin/harness.js skill validate bug-fleet` exits 0.
2. `agents/skills/claude-code/bug-fleet/SKILL.md` contains, in order: `# ` heading, `> ` summary, `## When to Use` (positive + negative bullets), `## Flags`, `## Process` (with `### Iron Law` and five named phase subsections SELECT / CONFIRM / DISPATCH / VERIFY / FILE-AND-REPORT), `## Harness Integration`, `## Success Criteria`, `## Gates`, `## Escalation`, `## Rationalizations to Reject`, `## Red Flags`, `## Examples`, `## Test Scenarios`.
3. The shipped body carries **no internal roadmap/PR/issue numbers**: `grep -nE '#[0-9]{2,}|ADR [0-9]{3,}|PR #' agents/skills/claude-code/bug-fleet/*` returns nothing.
4. The Iron Law sentence names REPRODUCTION-REQUIRED, the pinned base SHA, and "no repro → discarded, never filed"; the assertion-failure-vs-compile-error distinction appears in the VERIFY phase and in Gates.
5. `agents/skills/{codex,cursor,gemini-cli}/bug-fleet` each resolve as symlinks to `../claude-code/bug-fleet` (`test -L` + `readlink` = `../claude-code/bug-fleet`).
6. `docs/reference/fleet-family.md` Members table has a `bug-fleet` row, and the conveyor sentence names `bug-fleet` alongside the other quality-queue members.
7. `.claude-plugin/commands/bug-fleet.md`, `.cursor-plugin/commands/bug-fleet.md`, `.gemini-extension/commands/bug-fleet.toml`, and `.antigravity-extension/commands/bug-fleet.toml` exist, and `pnpm generate:plugin:check` exits 0 (all five targets).
8. `node scripts/generate-docs.mjs --check` exits 0 — `docs/reference/skills-catalog.md` carries a `### bug-fleet` entry and the regenerated counts.
9. `node node_modules/prettier/bin/prettier.cjs --check` passes on every file this change touches.
10. `harness validate` reports **no new issues attributable to bug-fleet files** versus the recorded baseline (388 issues, exit 1 — pre-existing, see Uncertainties).
11. `BASE_REF=origin/main node scripts/check-changesets.mjs` exits 0 (no `packages/*/src` change ⇒ no changeset required).
12. `pnpm docs:build` (VitePress) succeeds.

## NFR Targets

No NFR dimension was elicited: this phase produces documentation and skill metadata only — no hot path, no untrusted-input handler, no load-bearing component, no new failure mode. Performance, security, scalability, and resilience all fall back to their standing defaults (`harness check-perf` budgets and `harness check-security` floors run unchanged in CI). **No `category: nfr` tasks are emitted.**

## Uncertainties

- **[RESOLVED]** The roadmap shard `docs/roadmap.d/bug-fleet.md` already exists (added with the spec). Implementation-order item 2's shard half is done; only the fleet-family.md half remains. No roadmap edit in this phase.
- **[DECISION — recommend include]** `docs/reference/skills-catalog.md` is **already stale on this branch**: a clean regen bumps `781 skills` → `782` and `Tier 2 — Maintenance (61 skills)` → `(62)` before bug-fleet is added at all (the counts were hand-pinned on main and the cleanup-fleet merge did not bump them). CI runs `pnpm run generate-docs --check` as a **blocking** gate, so this branch is red today. Recommendation: commit the honest regen (`783` / `(63)` after bug-fleet) and call out the +1 pre-existing correction in the PR body. Alternative (mirror the sibling precedent: insert only the entry, leave counts) leaves the CI gate red.
- **[DECISION — recommend fix]** `agents/skills/claude-code/cleanup-fleet/SKILL.md` currently **fails** `prettier --check` (table re-padding); every other `-fleet` SKILL.md passes. `pnpm format:check` is a blocking CI gate, so this branch is red there too. Recommendation: repad it in its own commit (Task 15) so bug-fleet's PR is not blocked by a sibling's drift.
- **[ASSUMPTION]** Flags mirror the sibling's shape: `--concurrency`, `--report-only`, `--dry-run`, `--file-only` (file every verified bug as an issue; never open a fix PR). Caps (area size, candidates-per-area, repro attempts) are confirmed interactively in CONFIRM rather than exposed as flags.
- **[ASSUMPTION]** `addresses:` signals = `anomaly-outlier` (0.4) + `high-complexity` (0.2), drawn from the vocabulary already in use across shipped skills.
- **[ASSUMPTION]** Platform symlink set is exactly `codex`, `cursor`, `gemini-cli` (matches all siblings); `antigravity` is a plugin-generation target, not a skill-symlink source.
- **[DEFERRABLE]** Exact prose wording of phase bodies, example transcript numbers, and Test Scenario narratives. Does not affect task structure.

## Environment Facts (verified during planning — do not re-derive)

| Fact                                                                                                     | Consequence                                                                           |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Default `node` is v26; repo needs 22                                                                     | Every task prefixes `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"`       |
| `packages/cli/node_modules` is **missing** in this worktree (root `node_modules` is a symlink to parent) | `tsx`-based generators crash (`ERR_MODULE_NOT_FOUND: dotenv` / `semver`) → Task 1 fix |
| `packages/cli/dist` is a symlink to the parent repo's built CLI                                          | Use `node packages/cli/dist/bin/harness.js` — do not rebuild                          |
| `generate-plugin.mjs` write mode does `rmSync(<pluginDir>/commands)` before repopulating                 | **Never** run write mode here; use the staging recipe in Task 13                      |
| Prettier resolves config from the **file's** directory                                                   | Staging dirs must live inside the repo root, or quoting/escaping drifts               |
| `generate-docs.mjs --check` **writes** `docs/reference/*.md` then diffs                                  | Always `git diff docs/reference/` after, and normalize with the repo prettier binary  |
| `.husky/pre-commit` runs `pnpm generate:plugin:check` when `agents/skills/` is staged                    | Task 1 must land first or every commit in this plan fails for the wrong reason        |
| No `packages/*/src` change in this phase                                                                 | `check:changesets` passes with no changeset                                           |

**Verified recipe** (reproduces the committed sibling artifacts byte-for-byte — confirmed for claude, cursor, and gemini targets during planning).

## File Map

- CREATE `agents/skills/claude-code/bug-fleet/skill.yaml`
- CREATE `agents/skills/claude-code/bug-fleet/SKILL.md`
- CREATE `agents/skills/codex/bug-fleet` (symlink → `../claude-code/bug-fleet`)
- CREATE `agents/skills/cursor/bug-fleet` (symlink → `../claude-code/bug-fleet`)
- CREATE `agents/skills/gemini-cli/bug-fleet` (symlink → `../claude-code/bug-fleet`)
- CREATE `.claude-plugin/commands/bug-fleet.md` (generated)
- CREATE `.cursor-plugin/commands/bug-fleet.md` (generated)
- CREATE `.gemini-extension/commands/bug-fleet.toml` (generated)
- CREATE `.antigravity-extension/commands/bug-fleet.toml` (generated)
- MODIFY `docs/reference/fleet-family.md` (Members row + conveyor sentence)
- MODIFY `docs/reference/skills-catalog.md` (regenerated — never hand-edit)
- MODIFY `agents/skills/claude-code/cleanup-fleet/SKILL.md` (prettier repad only — pre-existing gate failure)
- CREATE `docs/changes/bug-fleet/plans/2026-08-08-bug-fleet-plan.md` (this file — commit it with Task 10)
- UNTRACKED (environment only) `packages/cli/node_modules` symlink

## Skeleton

1. Environment prep + baselines (~1 task, ~5 min)
2. `skill.yaml` (~1 task, ~5 min)
3. `SKILL.md` authored in seven ordered slices (~7 tasks, ~32 min)
4. Authoring gate + commit (~1 task, ~5 min)
5. Registration: fleet-family row, platform symlinks (~2 tasks, ~8 min)
6. Regeneration: plugin commands, skills catalog (~2 tasks, ~10 min)
7. Repo gates + human review (~3 tasks, ~12 min)

**Estimated total:** 17 tasks, ~75 minutes. _Skeleton approval: deferred to the invoking human (see the sign-off request accompanying this plan)._

---

## Tasks

Every task assumes this prologue in its shell:

```
cd /Users/cwarner/Projects/harness-engineering/.git-worktrees/bug-fleet
export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"
```

and defines `HARNESS="node packages/cli/dist/bin/harness.js"`, `PRETTIER="node node_modules/prettier/bin/prettier.cjs"`.

### Task 1: Repair the worktree generator environment and record gate baselines

**Depends on:** none | **Files:** `packages/cli/node_modules` (untracked symlink) | **Owns:** `packages/cli/node_modules`

1. `ln -sfn /Users/cwarner/Projects/harness-engineering/packages/cli/node_modules packages/cli/node_modules`
2. `node --version` — must print `v22.20.0`.
3. `pnpm generate:plugin:check` — must exit 0 (~10 s). If it still reports `ERR_MODULE_NOT_FOUND`, symlink the same way for the package named in the error before continuing.
4. `node scripts/generate-docs.mjs --check` — expect exit 1 with **only** the `781 → 782` / `(61 skills) → (62 skills)` count diff. Then `git checkout -- docs/reference/` (the check writes before diffing).
5. `$HARNESS validate > /tmp/bug-fleet-validate-baseline.txt 2>&1; echo $?` — record the count (expected: `x Validation failed (388 issues)`, exit 1). This is the baseline Task 15 compares against.
6. No commit (the symlink is gitignored).

### Task 2: Author `skill.yaml`

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/bug-fleet/skill.yaml` | **Owns:** `agents/skills/claude-code/bug-fleet/**`

1. `mkdir -p agents/skills/claude-code/bug-fleet`
2. Write `agents/skills/claude-code/bug-fleet/skill.yaml`:

```yaml
name: bug-fleet
version: '1.0.0'
description: Proactive undiscovered-bug hunt across the standing codebase — rank the codebase into disjoint risk-ordered areas by composing the existing detection analyses, confirm the batch once, fan out worktree-isolated subagents that each run the real per-area hunt (review machinery, adversarial refutation, a tdd-authored reproducing test, tracker cross-check, classification, debugging-driven fix), independently verify every item by pipeline-provenance artifact plus a re-run reproducing test at the pinned base SHA plus all-OS CI, and hand back a tiered batch of fix PRs and filed issues. No reproduction, no bug. Never auto-merges.
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
  command: harness skill run bug-fleet
  args:
    - name: path
      description: Project root path
      required: false
    - name: --concurrency
      description: 'Cap on concurrent hunt subagents (default: 2, max recommended 3 — the machine-storm limit)'
      required: false
    - name: --report-only
      description: Enumerate, score, and present the ranked area batch without dispatching hunt subagents
      required: false
    - name: --dry-run
      description: Run SELECT and CONFIRM only; do not fan out, verify, file, or open PRs
      required: false
    - name: --file-only
      description: File every verified bug as an issue with its reproducing test; never open a fix PR
      required: false
mcp:
  tool: run_skill
  input:
    skill: bug-fleet
    path: string
type: rigid
tier: 2
phases:
  - name: select
    description: Enumerate disjoint, risk-ranked codebase areas by composing hotspot detection, critical-path and blast-radius analysis, a churn pass, and coverage depth as a risk multiplier, seeded by bugs parked by other quality-queue members
    required: true
  - name: confirm
    description: Present the ranked areas, the pinned batch base SHA, the proposed concurrency, the bounded-safe vs risky-large fix boundary, the area-size bound, the candidates-per-area cap, and the reproduction-attempt budget for a single up-front human approval
    required: true
  - name: dispatch
    description: Fan out worktree-isolated subagents, each running the real per-area hunt over standing code — review machinery, adversarial refutation, a tdd-authored reproducing test, tracker cross-check, fix classification, and a debugging-driven fix for bounded-safe defects only — capped at the concurrency governor
    required: true
  - name: verify
    description: Independently confirm pipeline-provenance session artifacts exist, transplant each reproducing test onto the pinned base SHA and require an assertion-level failure, confirm it passes on the branch with the suite green, and confirm all-OS CI on every fix PR — never by subagent self-report
    required: true
  - name: file-and-report
    description: Run the cross-area dedup backstop, open one fix PR per verified bug without merging, file each risky or large bug as an issue linking and quoting its reproduction branch, report security-routed findings to the human without publishing an exploit, and emit a one-row-per-item batch summary including discarded, refuted, already-known, and clean-area outcomes
    required: true
state:
  persistent: false
  files: []
depends_on:
  - harness-hotspot-detector
  - harness-impact-analysis
  - harness-test-advisor
  - harness-code-review
  - harness-security-review
  - harness-tdd
  - harness-debugging
  - harness-roadmap-pilot
addresses:
  - signal: anomaly-outlier
    weight: 0.4
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

3. Verify: `$HARNESS skill validate bug-fleet` — it will report the missing `SKILL.md`; every **yaml** error must be absent.
4. No commit yet (Task 10 commits the pair).

### Task 3: SKILL.md slice 1 — heading, summary, framing, When to Use, Flags

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/bug-fleet/SKILL.md`

Create the file with exactly this section order and content mandate:

1. `# Bug Fleet`
2. A `> ` blockquote summary — one sentence naming: risk-ranked areas, one up-front confirmation, worktree-isolated subagents running the **real** per-area hunt, the reproduction bar, the tiered fix-PR/filed-issue terminal, never auto-merges, never trusts a self-report.
3. Two framing paragraphs: (a) the gap — every existing correctness gate looks at code already suspect (CI-red, reactive debugging, diff-scoped review, coverage-driven testing); nothing sweeps standing merged code for defects nobody has hit; (b) the inversion — the fleet turns a per-defect attention slog into "confirm the batch once, review the batch once", and is a **quality-queue** member, not part of the intake → decide → build → land spine.
4. One paragraph citing the shared spine: name `docs/reference/fleet-family.md` and list what it owns (five-phase skeleton, concurrency governor, artifact + all-OS-CI verification discipline, worktree fan-out with its nested-path push caveat, never-silent-merge invariant), then state what this SKILL.md defines for itself (its queue, its hunt taxonomy, its reproduction-gated verification, its tiered terminal act, its domain-specific rationalizations). **Cite the family ADRs by title only — no ADR numbers.**
5. `## When to Use` — at least four positive bullets (proactive sweep of standing code; turning hotspot/blast-radius/coverage analyses into verified defects; batch-scale hunting where per-defect interactive work does not scale; areas genuinely independent) and at least five `NOT for` bullets: a single known bug (`harness-debugging`), diff-scoped review of in-flight changes (`harness-code-review`), coverage-driven test authoring (`test-fleet`), already-manifested CI red or flaky runs (`cicd-fleet`), landing/merging PRs (`pr-fleet`), security-specific machinery and supply-chain risk.
6. `## Flags` — a four-row table (`Flag` | `Effect`) matching the `cli.args` of Task 2 exactly: `--concurrency`, `--report-only`, `--dry-run`, `--file-only`.

Verify: `grep -c '^## ' agents/skills/claude-code/bug-fleet/SKILL.md` = 2.

### Task 4: SKILL.md slice 2 — Iron Law, phase map, Phase 1 SELECT

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/bug-fleet/SKILL.md`

Append:

1. `## Process`, then `### Iron Law` with this bolded statement (exact intent, wording may tighten):

   > **A candidate defect is not a bug until a failing test reproduces it — deterministically, against unmodified code, at the pinned batch base SHA. No reproduction ⇒ discarded, never filed. The fleet never auto-merges, never patches a security-routed finding inline, and never accepts a subagent's self-report as proof its pipeline ran.**

   Follow with a paragraph explaining why: bug-hunting LLMs hallucinate defects at a high rate; an executable, deterministic reproduction is the only evidence that cannot be hallucinated; a proactive hunter with a weak bar is a backlog spammer, not a signal generator. State explicitly that **a clean area is a valid, valuable result** — the incentive to manufacture a finding is the exact failure mode the Iron Law exists to prevent.

2. The ASCII phase diagram (same shape as the family spine, terminal named `FILE-AND-REPORT`).
3. A five-row `Phase | Purpose | Exit Condition` table:
   - `1. SELECT` — compose analyses into disjoint risk-ranked areas — `Ranked Area[], disjoint and within the size bound, with risk basis`
   - `2. CONFIRM` — one human round: batch, pinned base SHA, governor, caps, fix boundary — `Approved batch with pinned base SHA and confirmed caps`
   - `3. DISPATCH` — subagents run HUNT → REFUTE → REPRODUCE → CROSS-CHECK → CLASSIFY → FIX — `Every area returned candidates, clean, parked, or failed (all recorded)`
   - `4. VERIFY` — provenance + transplanted repro + all-OS CI, never self-report — `Each item verified-fix / verified-issue / security-routed / rejected`
   - `5. FILE-AND-REPORT` — dedup backstop, tiered terminal act, batch summary — `Report delivered; nothing merged`
4. `### Phase 1: SELECT — Compose the Analyses into Disjoint, Risk-Ranked Areas`, numbered steps covering: composing `harness-hotspot-detector`, `get_critical_paths`, `harness-impact-analysis` / `compute_blast_radius`, a git-churn pass, and `harness-test-advisor` coverage depth **used only as a risk multiplier**; seeding from bugs parked by other quality-queue members; folding into **areas** (one coherent module/subsystem = one hunt = one worktree) that are **disjoint** (a file belongs to exactly one area) and within the size bound (default 40 files / 4,000 LOC, larger modules split into sub-areas); scoring by composite **churn × blast radius × critical-path membership × inverse coverage depth** reusing `harness-roadmap-pilot`-style impact scoring; degrading to the available analyses when one is missing rather than aborting; and an `Area { sources, id, files, riskBasis, score, forks }` record block.

### Task 5: SKILL.md slice 3 — Phase 2 CONFIRM and Phase 3 DISPATCH

**Depends on:** Task 4 | **Files:** `agents/skills/claude-code/bug-fleet/SKILL.md`

Append:

1. `### Phase 2: CONFIRM — The Single Up-Front Human Gate` (carrying the `[checkpoint:human-verify]` marker, as the sibling does) — one round presenting, together: the ranked areas with risk basis; the **pinned base SHA** the whole batch verifies against; the proposed concurrency (default 2, max ~3); the confirmed **bounded-safe vs risky/large** fix boundary; the **area-size bound** (40 files / 4,000 LOC); the **candidates-per-area cap** (8); the **reproduction-attempt budget** (2). State that this is the only guaranteed touchpoint before batch review, that the human approves or trims once, and that `--dry-run` stops here.
2. `### Phase 3: DISPATCH — Worktree Fan-Out With a Concurrency Governor`, with a numbered per-area pipeline. Each sub-stage gets its own labelled step:
   - **HUNT** — run the real review machinery over the area's **standing** code: the adversarial reviewer plus the security, typescript-strict, and frontend-races reviewers, honoring their own activation set (a non-UI area runs three, not four). State the four standing-code adaptations explicitly: whole-area scope (mechanically, the area diffed against the empty tree, so deep tier is expected not exceptional); **MECHANICAL is informational, never a stop** (a pre-existing red suite or failing `tsc` is recorded and is itself a lead); area size is bounded so the fan-out stays inside the reviewers' context ratio; `harness-security-review` runs in **full** mode so its threat-model phase actually runs.
   - **REFUTE** — an adversarial pass that actively tries to prove the candidate cannot occur (guarded upstream, unreachable, prevented by the type system, already covered by an existing test). Every refuted candidate is recorded with its refutation reason so a human can spot-check what was dropped.
   - **REPRODUCE** — the real `harness-tdd` authors a test that must fail **observably** and **deterministically** against unmodified code: run three times at the pinned base with a consistent red result; a flaky repro is discarded (a test that fails by chance satisfies red-on-base by chance). Exhausting the attempt budget ⇒ **discarded here, never reaching VERIFY**.
   - **CROSS-CHECK** — check the reproduced defect against open issues and recently-merged fix PRs; already-tracked or already-fixed ⇒ annotated **already-known** and dropped citing the resolving issue/PR.
   - **CLASSIFY** — `bounded-safe` (confined to the area; no public-API or observable-contract change; no cross-module refactor; no schema/migration change), `risky-large`, or `security-routed`. Tier on **fix risk, never on bug severity**.
   - **FIX** — bounded-safe only, via the real `harness-debugging`; one PR per verified bug.
   - Governor, per-area "assumptions made" note (ranking basis, hunt scope, refutation calls, fix-class call), park-the-unforeseen-fork behavior, and the push-path caveat (**never `--no-verify`**; push via the GitHub API or a non-nested throwaway worktree).
3. A `Candidate { area, description, originatingReviewer, refutation, reproduction, crossCheck, fixClass, provenance }` record block.

### Task 6: SKILL.md slice 4 — Phase 4 VERIFY and Phase 5 FILE-AND-REPORT

**Depends on:** Task 5 | **Files:** `agents/skills/claude-code/bug-fleet/SKILL.md`

Append:

1. `### Phase 4: VERIFY — Two Independent Proofs, Never Self-Report`, numbered:
   - Why two artifacts: the family invariant requires proof the **real pipeline ran**; the Iron Law additionally requires proof the **bug is real**. One artifact cannot do both — a hand-written test plus a hand-applied patch would satisfy a repro check while proving no pipeline ran.
   - **Provenance:** the `harness-tdd` (and, for fix items, `harness-debugging`) session state under `.harness/sessions/<slug>/`. Absent provenance = the pipeline did not run = rejected.
   - **Repro evidence, transplanted and re-run:** check out the **pinned batch base SHA** into a scratch worktree, apply **only the test file(s)** from the item's branch, and run them. The result must be an **assertion failure** — a compile, import, or module-resolution error means the test depends on the fix rather than reproducing the defect, and the item is **rejected**, not verified. Then confirm the test passes on the branch, the rest of the suite stayed green, and CI is green on **all target operating systems** plus the project's required checks. File-only items are verified the same way against their reproduction branch: red at the pinned base, no fix present.
   - Verdicts: `verified-fix`, `verified-issue`, `security-routed`, `rejected` (retried **once** first, then reported while the batch continues).
2. `### Phase 5: FILE-AND-REPORT — Tiered Terminal Act, Never Merge`, numbered:
   - Cross-area dedup backstop (areas are disjoint, so intra-batch duplicates should not arise — this is a backstop).
   - One **fix PR per verified bounded-safe bug**, carrying the now-passing reproducing test; independently reviewable and revertible; **never merged**.
   - Each **risky/large** bug filed as an issue whose reproducing test is pushed as a **test-only reproduction branch**, with the issue linking that branch and quoting the test source so both VERIFY and the eventual fixer can run it.
   - **Security-routed** findings reported to the human with the reproducing test held on the pushed branch — **never patched inline, never published as an exploit on a public issue**; disclosure is the human's call.
   - A one-row-per-item batch summary table (`Item | Area | Verdict | PR / Issue | Repro test | Assumptions made`) plus counts and reasons for discarded, refuted, already-known (citing the resolving issue/PR), and **clean areas reported as clean, not as failures**.
   - Degrade gracefully: a missing analysis source, a non-reproducing candidate, or one area's failed hunt is reported while the batch continues.

### Task 7: SKILL.md slice 5 — Harness Integration and Success Criteria

**Depends on:** Task 6 | **Files:** `agents/skills/claude-code/bug-fleet/SKILL.md`

Append:

1. `## Harness Integration` — one bullet each, each naming where it is used: `harness skill run bug-fleet`; `harness-hotspot-detector`; `harness-impact-analysis` / `compute_blast_radius`; `get_critical_paths`; `harness-test-advisor` (risk multiplier only); `harness-roadmap-pilot` (scoring approach); `harness-code-review` (the hunt's review machinery, with the standing-code adaptations); `harness-security-review` (full mode); `harness-tdd` (the reproducing test + half the verification evidence); `harness-debugging` (bounded-safe fixes); `harness-verify`; `gh` (tracker cross-check, CI reads, PR/issue creation); `harness skill validate bug-fleet`; `docs/reference/fleet-family.md`.
2. `## Success Criteria` — transcribe the spec's Success Criteria as skill-voice bullets, minus the two authoring-time ones (`harness skill validate` and the no-internal-numbers rule, which belong to this plan, not the shipped skill's runtime criteria). Must include: every item carries a deterministic reproducing test; every verified item carries provenance artifacts; nothing filed without repro evidence; assertion-failure-at-pinned-base for every fix PR; issues link and quote a reproduction branch; exactly one up-front human round; every PR/issue carries an assumptions note; risky/large filed never auto-applied; security-routed reported without a published exploit; already-known dropped with citation; clean areas are a valid outcome; never auto-merges; degrades gracefully with at most one retry; concurrency and caps never exceeded; no verdict on a self-report.

### Task 8: SKILL.md slice 6 — Gates and Escalation

**Depends on:** Task 7 | **Files:** `agents/skills/claude-code/bug-fleet/SKILL.md`

Append:

1. `## Gates` — at least eight bullets, each a hard stop:
   - No filing without a **deterministic** reproducing failing test (a high-confidence reviewer finding is not a bug).
   - A repro that fails at the base with a **compile/import/resolution error** is a **rejection**, not a pass.
   - A repro that is red only sometimes across the three base runs is **nondeterministic** ⇒ discarded.
   - Never auto-apply a **risky/large** fix — file it with its reproducing test.
   - Never patch a **security-routed** finding inline and never publish its exploit on a public issue.
   - Never auto-merge a fix PR.
   - Never exceed the concurrency governor or the confirmed area-size / candidate / attempt caps.
   - A self-report is never verification (provenance + re-run repro + all-OS CI, independently).
   - Never manufacture a finding to justify a sweep — a clean area is a valid result.
   - Never `--no-verify`.
2. `## Escalation` — at least five bullets: an analysis source is unavailable; a candidate survives refutation but will not reproduce within the budget; an area's hunt fails or forks unforeseeably; CI red on a subset of OS; the batch appears coupled (one area's fix depends on another's merge); a candidate turns out to be a security vulnerability.

### Task 9: SKILL.md slice 7 — Rationalizations, Red Flags, Examples, Test Scenarios

**Depends on:** Task 8 | **Files:** `agents/skills/claude-code/bug-fleet/SKILL.md`

Append:

1. `## Rationalizations to Reject` — a `Rationalization | Reality` table, **8–10 domain-specific rows, none of the universal filler rows**. Required rationalization keys:
   - "The reviewer is highly confident this is a real bug — file it without a repro"
   - "The repro only fails sometimes — a failure is a failure"
   - "The test errors at the base SHA because the helper does not exist there — close enough to red"
   - "This bug is severe, so fix it even though the fix spans five modules"
   - "I found a security hole with a clean repro — file the issue so it gets attention"
   - "The area is large but I will just review the interesting files"
   - "MECHANICAL is red from a pre-existing failing test, so this area is un-huntable"
   - "No defect here — but a sweep with nothing to show looks like a wasted run"
   - "I will hand-write the failing test and the patch; driving tdd/debugging is slower"
   - "It is already tracked but my repro is better — file it anyway"
2. `## Red Flags` — a `Flag | Corrective Action` table, five rows, each beginning `STOP.`: marking verified from a subagent summary; filing a plausible-but-unreproduced finding; applying a risky fix because it "looks contained"; publishing a security repro; `--no-verify` when the push gate fails.
3. `## Examples` — (a) a fenced `harness skill run bug-fleet --concurrency 2` transcript walking all five phases with concrete numbers (areas ranked, pinned base SHA, candidates surfaced/refuted/reproduced/discarded, one already-known drop, one clean area, one security-routed item, verdict table); (b) a short narrative example: **rejecting an item whose repro fails at the base with a module-resolution error** — the test depended on the fix, so it proves nothing.
4. `## Test Scenarios` — three scenarios, each naming the Gate or Rationalization it exercises: (1) an unreproduced but "obviously real" finding is filed anyway; (2) a repro that errors rather than asserts at the pinned base is accepted; (3) a security-routed candidate is patched inline / filed publicly.

### Task 10: Authoring gate — format, validate, no-internal-numbers, commit

**Depends on:** Task 9 | **Files:** `agents/skills/claude-code/bug-fleet/SKILL.md`, `agents/skills/claude-code/bug-fleet/skill.yaml`, `docs/changes/bug-fleet/plans/2026-08-08-bug-fleet-plan.md`

1. `$PRETTIER --write agents/skills/claude-code/bug-fleet/SKILL.md agents/skills/claude-code/bug-fleet/skill.yaml docs/changes/bug-fleet/plans/2026-08-08-bug-fleet-plan.md`
2. `$PRETTIER --check agents/skills/claude-code/bug-fleet/*` — must pass.
3. `$HARNESS skill validate bug-fleet` — must exit 0.
4. `grep -nE '#[0-9]{2,}|ADR [0-9]{3,}|PR #|issue #' agents/skills/claude-code/bug-fleet/SKILL.md agents/skills/claude-code/bug-fleet/skill.yaml` — must return **nothing**.
5. `grep -c '^## ' agents/skills/claude-code/bug-fleet/SKILL.md` — must be 12 (When to Use, Flags, Process, Harness Integration, Success Criteria, Gates, Escalation, Rationalizations to Reject, Red Flags, Examples, Test Scenarios, + heading check via `head -1`).
6. Commit: `feat(skills): bug-fleet — proactive standing-code bug hunt with a reproduction bar`
   (staging `agents/skills/claude-code/bug-fleet/` triggers the pre-commit `generate:plugin:check`; it passes because of Task 1, and reports drift for the not-yet-generated command files — if it blocks, defer this commit to Task 14 and keep the files staged. **Never `--no-verify`.**)

### Task 11: Register the member in the family spine page

**Depends on:** Task 10 | **Files:** `docs/reference/fleet-family.md` | **Category:** integration

1. In the conveyor sentence, replace
   `` `cicd-fleet`, `test-fleet`, and `cleanup-fleet` work quality queues alongside ``
   with
   `` `cicd-fleet`, `test-fleet`, `cleanup-fleet`, and `bug-fleet` work quality queues alongside ``.
2. Append a row to the Members table after `cleanup-fleet`:

   | `bug-fleet` | — | latent-defect risk queue (standing code) | review machinery → `tdd` (repro) → `debugging` (fix) | tiered: fix PRs + filed issues |

3. OPTIONAL (recommended): in "What each member defines for itself", extend the queue parenthetical with `risk-ranked standing-code areas`.
4. `$PRETTIER --write docs/reference/fleet-family.md && $PRETTIER --check docs/reference/fleet-family.md`
5. Commit: `docs(fleet-family): register bug-fleet in the members table and conveyor`

### Task 12: Create the platform skill symlinks

**Depends on:** Task 11 | **Files:** `agents/skills/codex/bug-fleet`, `agents/skills/cursor/bug-fleet`, `agents/skills/gemini-cli/bug-fleet` | **Category:** integration

1. `for p in codex cursor gemini-cli; do ln -s ../claude-code/bug-fleet agents/skills/$p/bug-fleet; done`
2. Verify: `for p in codex cursor gemini-cli; do test -L agents/skills/$p/bug-fleet && readlink agents/skills/$p/bug-fleet; done` — three lines of `../claude-code/bug-fleet`.
3. Verify git records them as symlinks: `git add agents/skills/{codex,cursor,gemini-cli}/bug-fleet && git ls-files -s agents/skills/*/bug-fleet` — mode must be `120000`.
4. No commit yet (Task 14 commits the generated set).

### Task 13: Generate the four plugin command manifests (staging recipe — never write mode)

**Depends on:** Task 12 | **Files:** `.claude-plugin/commands/bug-fleet.md`, `.cursor-plugin/commands/bug-fleet.md`, `.gemini-extension/commands/bug-fleet.toml`, `.antigravity-extension/commands/bug-fleet.toml` | **Category:** integration

**Do not run `pnpm generate:plugin` (write mode) — it `rm -rf`s each plugin `commands/` directory.**

1. Claude target:

   ```
   rm -rf tmp-plugin-claude-commands && mkdir -p tmp-plugin-claude-commands
   $HARNESS generate-slash-commands --platforms claude-code \
     --skills-dir agents/skills/claude-code --skills-dir-only \
     --output tmp-plugin-claude-commands --yes
   $PRETTIER --write --ignore-path .prettierignore tmp-plugin-claude-commands/harness
   cp tmp-plugin-claude-commands/harness/bug-fleet.md .claude-plugin/commands/bug-fleet.md
   ```

2. Cursor target — same shape with `--platforms cursor --skills-dir agents/skills/cursor --cursor-mode commands`, staging dir `tmp-plugin-cursor-commands`, copy to `.cursor-plugin/commands/bug-fleet.md`.
3. Gemini target — `--platforms gemini-cli --skills-dir agents/skills/gemini-cli`, staging dir `tmp-plugin-gemini-commands`, **no prettier** (TOML), copy `bug-fleet.toml` to **both** `.gemini-extension/commands/` and `.antigravity-extension/commands/` (verified identical for the sibling).
4. `rm -rf tmp-plugin-claude-commands tmp-plugin-cursor-commands tmp-plugin-gemini-commands`
5. Verify: `pnpm generate:plugin:check` — must exit 0 for all five targets.
6. No commit yet.

### Task 14: Regenerate the skills catalog and commit the generated set

**Depends on:** Task 13 | **Files:** `docs/reference/skills-catalog.md` | **Category:** integration

1. `node scripts/generate-docs.mjs`
2. `$PRETTIER --write "docs/reference/*.md"`
3. `git diff --stat docs/reference/` — **expect only `skills-catalog.md`**. If `cli-commands.md` or `mcp-tools.md` changed, step 2 did not run with the repo prettier binary; re-run it. If they still differ, `git checkout --` them and note it.
4. Verify content: a `### bug-fleet` entry exists under Tier 2, and the counts read `783 skills` / `Tier 2 — Maintenance (63 skills)` (the +2 includes the pre-existing +1 correction — see Uncertainties).
5. Verify gate: `node scripts/generate-docs.mjs --check` — must exit 0.
6. Commit: `chore(generated): regenerate plugin commands, platform symlinks, and skills catalog for bug-fleet`

### Task 15: Repo gates — format, changesets, validate delta

**Depends on:** Task 14 | **Files:** `agents/skills/claude-code/cleanup-fleet/SKILL.md` (pre-existing repad only)

1. `pnpm format:check` — record every failure. Expected: `agents/skills/claude-code/cleanup-fleet/SKILL.md` (pre-existing, unrelated to bug-fleet). No bug-fleet file may appear.
2. If the pre-existing failure blocks: `$PRETTIER --write agents/skills/claude-code/cleanup-fleet/SKILL.md`, re-run `pnpm format:check`, and commit separately: `style(skills): repad cleanup-fleet SKILL.md tables to prettier output`
3. `BASE_REF=origin/main node scripts/check-changesets.mjs` — must exit 0 (no `packages/*/src` change).
4. `$HARNESS validate > /tmp/bug-fleet-validate-after.txt 2>&1; echo $?` — compare the issue count against the Task 1 baseline (388). Any delta must be explained; `grep -c 'bug-fleet' /tmp/bug-fleet-validate-after.txt` must be 0.

### Task 16: VitePress docs build

**Depends on:** Task 15 | **Files:** none (gate only)

1. `pnpm docs:build` — must succeed. The two edited docs pages (`fleet-family.md`, `skills-catalog.md`) are in the site.
2. If it fails on the new content, the usual causes are multi-line inline code spans and bare angle brackets in Markdown — escape or fence them, re-run prettier, and amend the owning commit.

### Task 17: Human verification of the shipped skill `[checkpoint:human-verify]`

**Depends on:** Task 16 | **Files:** none (review only)

1. Present `agents/skills/claude-code/bug-fleet/SKILL.md` alongside the spec's `## Decisions made` (1–9) and confirm each decision is visibly encoded: spine citation (1), disjoint composed queue (2), the four standing-code review adaptations (3), REFUTE + REPRODUCE with the determinism rule (4), tiering on fix risk with one PR per bug (5), the two independent verification artifacts (6), the security boundary (7), tracker cross-check + dedup backstop (8), clean-area-is-success (9).
2. Present the gate results: `skill validate`, `generate:plugin:check`, `generate-docs --check`, `format:check`, `check-changesets`, `docs:build`, `harness validate` delta.
3. Wait for confirmation before the phase is marked complete.

## Notes for the executor

- **This is skill authoring, not package code.** No code-level TDD applies; the verification equivalents are `harness skill validate bug-fleet` (schema + required sections), the embedded Test Scenarios, and the mechanical gates in Tasks 13–16. Tasks 3–9 specify exact section order, exact table headers, exact record shapes, and the exact load-bearing sentences; the connective prose is authored at execution time (that is the deliverable's substance, not deferred detail).
- **Sibling as structural template:** `agents/skills/claude-code/cleanup-fleet/SKILL.md` — same section order, same table shapes, same voice. Do not copy its content; `bug-fleet`'s queue, hunt, bar, and terminal act are its own.
- **Compose, do not reimplement.** The queue is the existing analyses; the hunt is the existing review machinery; the repro is `harness-tdd`; the fix is `harness-debugging`.
- **Never run `pnpm generate:plugin` (write mode) in this worktree** — it deletes each plugin `commands/` directory before repopulating, and a partial generation here would wipe committed artifacts.
- **Never `--no-verify`.** If a hook blocks, fix the cause (Task 1 removes the common one).
- **Node 22 only.** Node 26 breaks native modules and the hooks.
- **The shipped body carries no internal roadmap/PR/issue/ADR numbers** — the spine page and the family ADRs are cited by title.
