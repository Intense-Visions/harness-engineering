# Plan — Holiday Confidence Tracker: make the fail-soft contract reachable and land the ledger

Trace of the `harness-workflow-audit` (INVENTORY -> MECHANICAL -> JUDGMENT -> REPORT) run executed
autonomously in a cicd-fleet remediation lane, followed by the remediation the audit's patches
prescribe.

- **Workflow:** `.github/workflows/holiday-confidence-track.yml`
- **Failure record:** 5/5 consecutive failures; **never once succeeded** since inception (2026-08-10)
  — runs `31372352672`, `32008807443`, `32704972836`, `33407509136`, `34128383695`
- **Cause class:** infra-config
- **Branch:** `cicd/holiday-confidence-ledger-commitback`, based on `origin/main` = `e7340f5c9`

> **Issue #1965 misdiagnoses this workflow.** It groups it with `snapshot.yml` under the `GH013`
> ruleset push rejection. This workflow never reaches `git push`. It dies two defects earlier, at
> `git add`, with exit 128. `GH013` is real, but it is the _third_ layer, not the first.

---

## Phase 1 — INVENTORY

Scoped to the one workflow named by the item; all phases still run (skill contract).

| Item            | Observation                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Triggers        | `schedule: '30 7 * * 1'`, `workflow_dispatch` — **no `paths:` / `paths-ignore:` filters at all**                                                   |
| Jobs            | one, `track`, on `ubuntu-latest`, 6 steps                                                                                                          |
| Permissions     | workflow-level `contents: write` only                                                                                                              |
| Concurrency     | `holiday-confidence-track`, `cancel-in-progress: false`                                                                                            |
| Actions used    | `actions/checkout@v6`, `actions/setup-node@v6`, `pnpm/action-setup@v5`                                                                             |
| Documented gate | the header's own **fail-soft contract**: _"this job records NOTHING and still succeeds — a missing data point is honest, a fabricated one is not"_ |
| Tree snapshot   | `git ls-files '.harness/metrics/*'` -> **zero tracked files**. The ledger has never existed on `main`.                                             |

## Phase 2 — MECHANICAL

| Check                             | Verdict                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** path-filter correctness    | **N/A** — the workflow declares no `paths:` / `paths-ignore:` globs. Nothing to resolve; recorded rather than skipped.                                                                                                                                                                                                                                  |
| **M2** permission scoping         | **ERROR** — see F3. `contents: write` is correct for the push, but the remediation adds a `gh pr create` fallback, and under the default `pull-requests: read` that call fails _after_ the branch is pushed.                                                                                                                                            |
| **M3** action pinning             | **INFO** — three actions on mutable major tags. `actions/*` are first-party; `pnpm/action-setup@v5` is third-party on a mutable tag, but this matches the convention used by every other workflow in the repo (`ci.yml`, `release.yml`, `roadmap-auto-done.yml`). Consistent, not a lane-scoped defect. No patch — repo-wide pinning is its own change. |
| **M4** self-trigger / concurrency | **PASS** — `[skip ci]` on the commit; triggers are `schedule` + `workflow_dispatch` only, so no push self-trigger loop is possible; a `concurrency:` group serializes commit-backs. M4.3 (PR-head branch deletion) does not apply — this pushes to the default branch.                                                                                  |
| **M5** secret handling            | **PASS** — `GITHUB_TOKEN` is passed via `env:`, never echoed or put on a command line.                                                                                                                                                                                                                                                                  |
| **M6** dead / stale references    | **PASS** — `node packages/cli/dist/bin/harness.js holiday-confidence` resolves: the command is registered at `packages/cli/src/commands/_registry.ts:53` from `packages/cli/src/commands/holiday-confidence.ts:70`.                                                                                                                                     |

## Phase 3 — JUDGMENT

Run in full despite a near-clean Phase 2 — per the skill's gate, _"No skipping Phase 3 on a clean
Phase 2."_ Every finding below came from Phase 3.

| Check                      | Verdict                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **J1** script injection    | **PASS** — no `github.event.*`, `head_ref`, or other attacker-controlled value reaches a `run:` script. The only interpolation is `secrets.GITHUB_TOKEN` into `env:`. |
| **J2** gate completeness   | **ERROR x3** — F1, F2, F4 below. The workflow's _own documented contract_ is the gate, and it was wired to a step that cannot honour it.                              |
| **J3** ratchet calibration | **N/A** — this is a trend ledger, not a blocking ratchet. Nothing blocks a PR on its content.                                                                         |
| **J4** fork-PR degradation | **N/A** — never runs on `pull_request`.                                                                                                                               |

## Phase 4 — REPORT: the findings, ranked

### [ERROR] F1 — contract-unreachable · `holiday-confidence-track.yml:109` (pre-fix)

The header promises: _"this job records NOTHING and still succeeds."_ When the KPI abstains, the
ledger file is never created. The next step then runs:

```
git add .harness/metrics/holiday-confidence.jsonl
```

under `shell: /usr/bin/bash -e`. Observed in run `34128383695`:

```
No parseable KPI output; recording nothing (fail-soft).
...
fatal: pathspec '.harness/metrics/holiday-confidence.jsonl' did not match any files
##[error]Process completed with exit code 128
```

**Effect:** the documented abstain path could never succeed. Every abstain was a red job.

**Patch:** guard on existence before staging (Fork C -> **C1**):

```diff
+          LEDGER=".harness/metrics/holiday-confidence.jsonl"
+          if [ ! -f "$LEDGER" ]; then
+            echo "No ledger present — the KPI abstained this run; nothing to commit."
+            exit 0
+          fi
```

Not `continue-on-error:` — that would hide a genuine failure. This exits clean _because nothing
failed_; there is simply nothing to record, which is precisely what the header describes.

### [ERROR] F2 — ledger-ungitignorable · `.harness/.gitignore:46` (pre-fix)

Even when the ledger **is** written, it can never be staged:

```
$ git check-ignore -v .harness/metrics/holiday-confidence.jsonl
.harness/.gitignore:46:metrics/	.harness/metrics/holiday-confidence.jsonl
```

The subtlety: `.harness/.gitignore` already carried the correct rule, added by the workflow's own
originating PR (`0563679fd`, #1131):

```
# metrics/: track the holiday-confidence trend ledger, ignore everything else
metrics/*
!metrics/holiday-confidence.jsonl
```

A **later, unrelated** commit — `9e2b9b46d` _"docs(roadmap): register 4 deepseek-harness adoption
candidates"_ — re-added a bare `metrics/` at line 46. A directory-suffix ignore stops git descending
into `.harness/metrics/` at all, so the earlier negation is unreachable no matter what order the
patterns appear in. The un-ignore was silently switched off by a docs commit and nobody noticed,
because the workflow was already failing one defect earlier.

**Patch (Fork B -> B1):** delete the stray line 46 and harden the surviving block's comment against
re-introduction. The un-ignore stays exactly where it was, in the shape the `security/timeline.json`
precedent established two lines below it.

**Verified after the patch** (both directions, since a negation that over-matches is its own defect):

| Path                                              | Before                      | After                                       |
| ------------------------------------------------- | --------------------------- | ------------------------------------------- |
| `.harness/metrics/holiday-confidence.jsonl`       | ignored (`git add` refused) | **stageable** (`git add -n` -> `add '...'`) |
| `.harness/metrics/adoption.jsonl` (CLI telemetry) | ignored                     | **still ignored** (`metrics/*`, exit 1)     |

### [ERROR] F3 — push-blocked-by-ruleset · `holiday-confidence-track.yml:111` (pre-fix)

Only reachable once F1 and F2 clear. The bare `git push` to the default branch hits the same
ruleset rejection that blocks `snapshot.yml`:

```
GH013: Repository rule violations found ... Changes must be made through a pull request.
```

**Patch (Fork A -> A1):** the repo's own proven push-then-fall-back-to-PR idiom, ported verbatim in
shape from `ci.yml` (~L326-360, ~L473-496), `release.yml` (~L141-165) and `roadmap-auto-done.yml`
(~L181-203):

1. three direct-push attempts, each preceded by `git rebase --abort || true` + `git reset --hard "$OURS"`
   so a failed rebase can never leave the tree dirty for the next attempt (the same pair repeats once
   after the loop, since a final-attempt conflict would otherwise leave the repo mid-rebase and
   `git checkout -B` refuses to run in that state — a gap the three precedents share);
2. on exhaustion, branch from the live tip of the default branch, re-apply only the ledger, push the
   branch, `gh pr create`;
3. scope-guard the diff with the existing `scripts/assert-diff-scope.mjs` and self-approve +
   auto-merge **only** when `BASELINE_AUTOAPPROVE_PAT` is present.

Two supporting changes the fallback requires:

- `pull-requests: write` added to `permissions:`. Under `read`, `gh pr create` fails with _"Resource
  not accessible by integration (createPullRequest)"_ **after** the branch is already pushed —
  stranding the branch and dropping the record. This is the exact failure `roadmap-auto-done.yml:31-36`
  documents having shipped with, where _"the fallback shipped without this widening, so it had never
  once succeeded."_
- `fetch-depth: 0` on the checkout, so the rebase and the branch-from-tip have real history.

**Deliberate divergence from the precedents, recorded as an assumption:** when the PAT secret is
absent, the precedents' unconditional `gh pr review --approve` would fail and take the job red. Here
the job prints `::notice::` with the PR URL and exits 0. That is not hiding a failure — the PR
exists, its URL is in the log, and the record is not lost. It preserves the workflow's defining
property (a metrics tracker must never red the repo) without fabricating anything.

### [ERROR] F4 — kpi-json-flag-shadowed · `packages/cli/src/index.ts:76` vs `packages/cli/src/commands/holiday-confidence.ts:76`

**Found during this audit; not in the item brief; not in #1965.**

Fixing F1-F3 alone would have shipped a workflow that is green and records **nothing, forever** —
the Iron Law failure this skill exists to prevent (_"a gate that never fires is worse than no gate —
it manufactures false confidence"_). The abstain in run `34128383695` was not the KPI being honestly
undeterminable. It was a CLI defect.

The root program declares `--json` (`packages/cli/src/index.ts:76`) and so does the subcommand
(`holiday-confidence.ts:76`). Commander binds a repeated flag to the **first** command that declared
it, so `harness holiday-confidence --json` stores `json: true` on the _program_ and leaves the
subcommand's own `opts.json` `undefined`. Reproduced locally against the built CLI:

```
["holiday-confidence","--json"]            => subOpts: {}              progOpts: {"json":true}
["holiday-confidence","--window","7"]      => subOpts: {"window":"7"}  progOpts: {}
["holiday-confidence","--window","7","--json"] => subOpts: {"window":"7"} progOpts: {"json":true}
```

So `--json` was a silent no-op, the command rendered pretty text, and the workflow's `JSON.parse`
threw on every run. `No parseable KPI output` was the symptom of this, not of an empty window.

**Patch:** read `cmd.optsWithGlobals()` instead of the action's own `opts` — the repo's existing
idiom for exactly this collision (`snapshot.ts:240`, `usage.ts:143`, `scan-config.ts:176`,
`create-skill.ts:250`).

**Revert protocol** (the regression test must fail without the fix):

| Gate state                                 | Result                                |
| ------------------------------------------ | ------------------------------------- |
| Reverted to `.action(async (opts) => ...)` | **FAIL** — `2 failed \| 2 passed (4)` |
| Restored to `optsWithGlobals()`            | **PASS** — `4 passed (4)`             |

### [WARNING] F5 — abstain-reason-invisible · the `Compute and record` step

`No parseable KPI output; recording nothing (fail-soft).` is all five failing runs ever said about
why the KPI abstained. It printed no byte of what the command actually emitted, which is why F4
survived five runs unnoticed. The patch echoes the byte count and first 20 lines of the raw stdout
as a `::warning::`, so the next regression of this class is one log line away rather than one
audit away.

### [INFO] F6 — systemic `--json` shadowing beyond this command — **NOT fixed here**

F4 is not local to `holiday-confidence`. **36** command files declare `--json`, and the shadowing
applies to all of them. Verified against the built CLI:

```
insights  => subOpts.json: undefined   progOpts.json: true
adoption  => subOpts.json: undefined   progOpts.json: true
verify    => subOpts.json: undefined   progOpts.json: true
```

Every one of those that reads `opts.json` directly has a `--json` flag that does nothing. That is a
repo-wide CLI defect with its own blast radius and its own test burden. **Deliberately out of scope
for this lane** — fixed here only for the one command this workflow depends on. Reported to the
orchestrator for routing.

---

## Summary block

```
WORKFLOW AUDIT: harness-engineering (scoped: holiday-confidence-track.yml)
Workflows audited: 1   Findings: 4 error, 1 warning, 1 info
Gates that never fire: holiday-confidence-track.yml — the workflow's own documented
  fail-soft contract ("records nothing and still succeeds") was unreachable; the job
  has never succeeded once since 2026-08-10.
Documented-but-unwired gates: the Holiday Confidence trend ledger — documented in the
  workflow header and in docs/ as a tracked KPI, but zero records have ever been
  written, and none could have been.
```

Per the skill's **Escalation** clause for a long-dead gate: this gate has been dead since inception,
so there is no backlog of suppressed findings to re-arm — the ledger simply starts empty. The first
successful run will write record #1.

---

## Remediation actions

| #   | File                                                   | Change                                                                                                                                                  |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `.github/workflows/holiday-confidence-track.yml`       | `[ -f "$LEDGER" ] \|\| exit 0` guard before `git add` (F1)                                                                                              |
| 2   | `.harness/.gitignore`                                  | remove the stray `metrics/` re-ignore; harden the surviving block's comment (F2)                                                                        |
| 3   | `.github/workflows/holiday-confidence-track.yml`       | push-then-PR fallback with scope guard + `pull-requests: write` + `fetch-depth: 0` (F3)                                                                 |
| 4   | `.github/workflows/holiday-confidence-track.yml`       | `HUSKY: '0'` on the commit-back step (Fork D -> D1; precedent `roadmap-auto-done.yml:152`)                                                              |
| 5   | `.github/workflows/holiday-confidence-track.yml`       | header rewritten: the contract it documents changed, and a stale header on a file whose whole defect was a broken documented contract is its own defect |
| 6   | `packages/cli/src/commands/holiday-confidence.ts`      | `optsWithGlobals()` so `--json` is honoured (F4)                                                                                                        |
| 7   | `packages/cli/src/commands/holiday-confidence.test.ts` | 4 regression tests parsed through a root program that also declares `--json` — the only arrangement in which the shadowing reproduces                   |
| 8   | `.github/workflows/holiday-confidence-track.yml`       | echo raw stdout on parse failure (F5)                                                                                                                   |

## Recommended-option defaults taken

All five decision forks were pre-answered by the human and implemented as given:

- **Fork A -> A1** — this repo's own push-then-PR idiom. No `peter-evans/create-pull-request`, no
  PAT dependency for the push itself, no ruleset bypass.
- **Fork B -> B1** — un-ignore the one ledger beside the existing rule, mirroring the
  `security/*` + `!security/timeline.json` precedent. Ledger not relocated; commit-back not dropped.
- **Fork C -> C1** — existence guard, contract preserved verbatim. No fabricated data point, no
  `continue-on-error:`.
- **Fork D -> D1** — `HUSKY: '0'` on the commit-back step.
- **Fork E -> E1** — own PR. `.github/workflows/snapshot.yml` **not touched** (sibling lane's diff).

## Assumptions made

1. **Scope was extended beyond `holiday-confidence-track.yml` + `.harness/.gitignore`** to include
   `packages/cli/src/commands/holiday-confidence.ts` and a new test file. Justification: without F4
   the remediated workflow goes green while recording nothing forever, which is the exact
   false-confidence outcome the audit skill's Iron Law forbids and which this fleet's "never hide a
   failure" gate is meant to prevent. The change is 1 line of behaviour in 1 file, in an idiom the
   repo already uses in 4 places, and collides with no sibling lane.
2. **The systemic half of F4 (36 commands) was deliberately left unfixed.** It is a separate change
   with a separate test burden; touching it here would make this PR unreviewable and would collide
   with any concurrent CLI work.
3. **The PAT-absent path exits 0 with a `::notice::` rather than red**, diverging from the three
   precedents which approve unconditionally. Rationale in F3. Reviewer-visible and reversible in one
   line if the fleet prefers strict precedent parity.
4. **`GH013` was not re-observed on this branch.** It is inferred from `snapshot.yml`'s identical
   bare `git push` to the same protected branch and from the ruleset that produced it there. This
   workflow has never reached its own `git push`, so there is no run log showing `GH013` for it.
   The fallback is therefore written defensively: if the direct push _does_ succeed, the job exits
   at step 1 and the PR path never runs.
5. **The scheduled run cannot be exercised from a PR.** `on:` is `schedule` + `workflow_dispatch`
   only, so PR CI does not execute this workflow. Verification is therefore: YAML parses, every
   `run:` block passes `bash -n`, the embedded node script passes `node --check`, and the commit
   step's three branches were simulated in a scratch git repo. The first real proof is the next
   Monday run (or a manual `workflow_dispatch` after merge).

## Verification performed

- **YAML** parses (`js-yaml`); `permissions` resolves to `{contents: write, pull-requests: write}`;
  checkout carries `fetch-depth: 0`.
- **Every `run:` block** passes `bash -n`; the embedded heredoc passes `node --check`.
- **Commit step simulated** in a scratch git repo, all three branches:

  | Scenario                   | Result                                                                             |
  | -------------------------- | ---------------------------------------------------------------------------------- |
  | ledger absent (abstain)    | `No ledger present — the KPI abstained this run; nothing to commit.` exit **0**    |
  | ledger present, new record | commit created, 1 file changed, 1 insertion                                        |
  | ledger present, unchanged  | `Ledger unchanged (already recorded for this date); nothing to commit.` exit **0** |

  Pre-fix, the first of those three was `exit 128`.

- **gitignore** verified in both directions (table under F2).
- **CLI regression tests** `4 passed (4)`; revert protocol confirms `2 failed` without the fix.
