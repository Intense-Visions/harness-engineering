# Plan — Architecture Snapshot commit-back: replace the bare `git push` to protected `main` with the repo's push-then-PR idiom

Trace of the `harness-workflow-audit` (INVENTORY -> MECHANICAL -> JUDGMENT -> REPORT) run executed
autonomously in a cicd-fleet remediation lane, scoped to the **commit-back defect class**.

- **Workflow:** `.github/workflows/snapshot.yml` (`Architecture Snapshot`)
- **Failure history:** 15/15 visible scheduled runs failed, unbroken from `2026-06-01` through `2026-09-07`
- **Classification:** infra-config defect (workflow), not a product defect
- **Branch:** `cicd/snapshot-commit-back-via-pr`, based on `origin/main` = `e7340f5c9`
- **Refs:** #1965

---

## Phase 1 — INVENTORY

### Workflows enumerated

23 files under `.github/workflows/*.yml`. Parsed for triggers, `paths:` filters, `permissions:`
blocks, `concurrency:` groups, `uses:` refs, and every `run:` script.

### The commit-back sub-inventory (this audit's scope)

Grepping every workflow for `git push` / `git commit` / `gh pr create` / `peter-evans` yields exactly
**five** commit-back jobs, in two shapes:

| Workflow                             | Line      | Shape                                                       | `[skip ci]` | `HUSKY=0`  | Status                |
| ------------------------------------ | --------- | ----------------------------------------------------------- | ----------- | ---------- | --------------------- |
| `ci.yml` (refresh-baselines)         | 329–380   | push -> PR fallback, scope-guarded self-approve + automerge | yes         | yes        | working               |
| `ci.yml` (comprehension refresh)     | 473–500   | push -> PR fallback, **plain PR for human review**          | yes         | yes        | working               |
| `release.yml` (golden promote)       | 130–175   | rebase-retry x3 -> PR fallback, self-approve                | yes         | yes        | working               |
| `roadmap-auto-done.yml`              | 170–205   | rebase-retry x3 -> PR fallback, self-approve                | yes         | yes        | working               |
| **`snapshot.yml` (Commit snapshot)** | **21–27** | **bare `git push`, no fallback**                            | **no**      | **no**     | **BROKEN**            |
| `holiday-confidence-track.yml`       | 110–111   | bare `git push`, no fallback                                | yes         | (see note) | BROKEN — sibling lane |

No `peter-evans/create-pull-request` anywhere in the repo; the push-then-fall-back-to-PR idiom is
entirely hand-rolled and is the established convention.

### Documented gates that consume this workflow's output

`.harness/arch/timeline.json` is a **tracked** file with three live readers:

- `packages/core/src/architecture/prediction-engine.ts:81` — `if (snapshots.length < 3) throw`
- `packages/cli/src/mcp/tools/decay-trends.ts:77` — `get_decay_trends`
- `packages/core/src/architecture/timeline-manager.ts:116` — `snapshots.length === 1` degenerate path
- `packages/core/src/insights/aggregator.ts:78` — insights rollup
- `packages/cli/src/commands/snapshot.ts:196` — `harness snapshot trend`

### File-tree snapshot

`git ls-files` at `e7340f5c9`, used for every path-filter resolution in Phase 2.

---

## Phase 2 — MECHANICAL

### M1 — Path-filter correctness

`snapshot.yml` carries **no** `paths:` / `paths-ignore:` filters (`schedule` + `workflow_dispatch`
only), so M1 is vacuous for the item. Every glob in the repo was still resolved, per the skill's
gate ("a filter you did not resolve is a filter you did not audit"):

| Glob                                           | Workflow(s)                                                                                             | `git ls-files` matches |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------- |
| `src/**`                                       | `persona-architecture-enforcer`, `-documentation-maintainer`, `-performance-guardian`, `-task-executor` | **0**                  |
| `docs/**`                                      | `persona-documentation-maintainer`                                                                      | 2045                   |
| `packages/**`                                  | `persona-performance-guardian`, `persona-task-executor`                                                 | 4223                   |
| `packages/orchestrator/src/gateway/openapi/**` | `openapi-drift-check`                                                                                   | 4                      |
| `packages/types/src/auth.ts`                   | `openapi-drift-check`                                                                                   | 1                      |
| `docs/api/openapi.yaml`                        | `openapi-drift-check`                                                                                   | 1                      |
| `.github/workflows/openapi-drift-check.yml`    | `openapi-drift-check`                                                                                   | 1                      |

**[ERROR] path-filter-dead** — `src/**` matches **zero** tracked files (this is a pnpm workspace;
sources live under `packages/*/src`). Four persona workflows are gated on it. **Reported, not
fixed** — out of this item's diff scope (see REPORT).

### M2 — Permission scoping

**[ERROR] permissions-insufficient** `.github/workflows/snapshot.yml:10-11`

`permissions: contents: write` is the whole grant. `contents: write` is _scope_, not a ruleset
bypass — it cannot satisfy a "Changes must be made through a pull request" rule, which is enforced
server-side regardless of token scope. And once a PR fallback exists, `pull-requests: write` is
required or `gh pr create` fails with `Resource not accessible by integration` (the exact hazard
already documented at `ci.yml:238-243`).

### M3 — Action pinning

`snapshot.yml` uses `actions/checkout@v6`, `actions/setup-node@v6` (first-party, mutable major tag)
and `pnpm/action-setup@v5` (third-party, mutable major tag).

**[INFO] pinning** — the repo pins **nothing** to a SHA: all 12 distinct `uses:` refs across all 23
workflows are on mutable major tags (`changesets/action@v1`, `codecov/codecov-action@v5`,
`docker/*`, `pnpm/action-setup@v5`, …). `snapshot.yml` is _consistent with_ repo convention, not a
regression against it. Per M3.2 the finding is repo-wide and belongs to a dedicated supply-chain
pass — changing it here would be an unreviewable one-off. Reported, not fixed.

### M4 — Self-trigger and concurrency safety

**[ERROR] pushback-unguarded** `.github/workflows/snapshot.yml:26-27` — this is the root cause.

```
git diff --cached --quiet || git commit -m "chore: architecture snapshot $(date +%Y-%m-%d)"
git push
```

A bare `git push` to the protected default branch. Verified against run `34120963994`
(`gh run view 34120963994 --log-failed`):

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Changes must be made through a pull request.
 ! [remote rejected] main -> main (push declined due to repository rule violations)
error: failed to push some refs
##[error]Process completed with exit code 1
```

**[ERROR] selftrigger-no-skip-ci** `.github/workflows/snapshot.yml:26` — the commit message carries
no `[skip ci]`. Every other commit-back job in the repo does. Latent: if the push ever _did_ land on
main it would start a fresh CI run on main (including `refresh-baselines`, itself a commit-back job).

**[WARNING] concurrency-missing** `.github/workflows/snapshot.yml` — no `concurrency:` group. A
weekly cron plus an ad-hoc `workflow_dispatch` can overlap; both would append to the same
`timeline.json` and race on the fallback branch.

### M5 — Secret handling

Clean. `snapshot.yml` referenced no secrets before this change and echoes none after it.

### M6 — Dead and stale references

Clean. `node packages/cli/dist/bin/harness.js snapshot capture` resolves:
`createSnapshotCommand` is registered at `packages/cli/src/commands/_registry.ts:102` and the
`capture` subcommand is declared at `packages/cli/src/commands/snapshot.ts:238`.

---

## Phase 3 — JUDGMENT

Run in full. The skill's gate is explicit: _"No skipping Phase 3 on a clean Phase 2."_ Phase 2 was
not clean, and Phase 3 is where the actual blast radius surfaced.

### J1 — Script injection

Clean. The only interpolation in the `run:` block is `$(date +%Y-%m-%d)`, a shell substitution of a
trusted command. No `github.event.*`, no `github.head_ref`, no `pull_request_target`. The
`GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` added by this change is routed through `env:` (data, not
code), matching the M5/J1 prescription.

### J2 — Gate completeness — **this is the real finding**

The workflow ran weekly and failed weekly, so the _gate_ (the architecture-trend series) has been
silently dead while looking scheduled. Evidence, not assertion:

- `.harness/arch/timeline.json` last changed in `f8d593648` — _"chore: architecture snapshot
  2026-04-06"_. **Five months** of a weekly job producing nothing.
- The file contains **exactly one** snapshot entry (`capturedAt: 2026-04-06T14:20:52.339Z`,
  `commitHash: 0669068`, `stabilityScore: 57`).
- `packages/core/src/architecture/prediction-engine.ts:81` throws
  `PredictionEngine requires at least 3 snapshots, got ${snapshots.length}`. With one point, the
  `predict_failures` MCP tool has been **hard-erroring for five months**.
- `packages/core/src/architecture/timeline-manager.ts:116` takes the degenerate
  `snapshots.length === 1` branch, so `get_decay_trends` and `harness snapshot trend` return a
  no-trend answer that is indistinguishable from "the architecture is stable".
- There is **no staleness signal** anywhere: no consumer compares `capturedAt` against now. A
  five-month-old single data point is served as if it were current.

This is the skill's Iron Law verbatim: _a gate that never fires is worse than no gate — it
manufactures false confidence._ The MECHANICAL finding is the mechanism; this is why it mattered.

Per the skill's Escalation rule for a long-dead gate, re-arming it is expected to surface a step
change in the metrics (five months of drift folded into one delta against the 2026-04-06 point).
That is a **reporting** artifact, not a regression: `snapshot capture` is observational and blocks
nothing. No backfill is possible — the metrics are computed against a working tree, and historical
points would require checking out and building 22 past commits. Recommended instead: merge the
first new point, then read the second and third weeks' deltas as the first honest trend.

### J3 — Ratchet and severity calibration

Not applicable. `snapshot capture` writes an observational series; it is not a ratchet and gates
nothing. No severity threshold to calibrate.

### J4 — Fork-PR degradation

Not applicable. `snapshot.yml` triggers only on `schedule` and `workflow_dispatch`, both of which
run on the base repository with a writable `GITHUB_TOKEN`. There is no fork-PR path.

---

## Phase 4 — REPORT

```
WORKFLOW AUDIT: harness-engineering (scope: commit-back defect class)
Workflows audited: 23   Findings: 4 error, 2 warning, 1 info
Gates that never fire: snapshot.yml (commit-back rejected 15/15 runs since 2026-06-01);
                       4x persona-*.yml (paths: src/** matches 0 tracked files)
Documented-but-unwired gates: none new — but the architecture-trend series has been
                       frozen at a single 2026-04-06 point for five months
```

Ranked:

1. **[ERROR] pushback-unguarded** `snapshot.yml:26-27` — FIXED here
2. **[ERROR] permissions-insufficient** `snapshot.yml:10-11` — FIXED here
3. **[ERROR] selftrigger-no-skip-ci** `snapshot.yml:26` — FIXED here
4. **[ERROR] path-filter-dead** `persona-*.yml` `src/**` -> 0 matches — REPORTED, out of scope
5. **[WARNING] concurrency-missing** `snapshot.yml` — FIXED here
6. **[WARNING] pushback-unguarded** `holiday-confidence-track.yml:110-111` — same defect class,
   **owned by a concurrent sibling lane**; deliberately untouched
7. **[INFO] pinning** — repo-wide mutable-tag convention, not a `snapshot.yml` regression

---

## The fix

Fork A -> **A1**: reuse this repo's own proven push-then-fall-back-to-PR idiom. No
`peter-evans/create-pull-request`, no PAT, no ruleset bypass.

Two in-repo shapes exist. The PAT-bearing self-approve+automerge shape
(`ci.yml` refresh-baselines, `release.yml`, `roadmap-auto-done.yml`) requires
`secrets.BASELINE_AUTOAPPROVE_PAT`; the decision explicitly forbids adding a PAT. So the fix mirrors
the **plain-PR-for-human-review** shape at `ci.yml:463-500` ("Commit refreshed semantic shards"),
which uses only `secrets.GITHUB_TOKEN`.

Fork D -> **D1**: `HUSKY: '0'` on the commit step, precedent `roadmap-auto-done.yml:152`. This is not
speculative — the failing run's log shows the full pre-commit gauntlet executing _inside_ the
`Commit snapshot` step before the push was rejected:

```
Running test:coverage in 0 packages ... Coverage ratchet: all packages meet or exceed baselines.
> node scripts/generate-docs.mjs "--check"   ... ✓ All reference docs are fresh.
> node scripts/generate-tool-catalog.mjs --check ... ✓ Tool & skill catalog is up to date.
```

Those gates happened to pass on this run. On a run where a generated doc has drifted on main (a
documented recurring condition in this repo) they would fail the step for an unrelated reason — a
latent second failure mode, removed.

Fork E -> **E1**: this ships as its own PR. `holiday-confidence-track.yml` and `.harness/.gitignore`
are untouched.

### `.github/workflows/snapshot.yml` — what changed

1. **`concurrency:`** group `architecture-snapshot`, `cancel-in-progress: false` (M4.5). Serializing
   is correct rather than cancelling: a cancelled capture silently loses that week's data point.
2. **`permissions:`** gains `pull-requests: write` alongside `contents: write` (M2), with the
   `Resource not accessible by integration` rationale recorded inline as `ci.yml:238-243` does.
3. **`env:`** on the commit step: `HUSKY: '0'` (D1) and `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` for
   the `gh` calls.
4. **Explicit empty-diff short-circuit.** The old `git diff --cached --quiet || git commit` left the
   step to fall through to `git push` even with nothing staged. Now an empty diff `exit 0`s
   immediately, matching all four working precedents.
5. **`[skip ci]`** appended to the commit subject on both the direct-push and PR paths (M4.2),
   matching every other commit-back job in the repo.
6. **Push-then-PR fallback**, mirroring `ci.yml:475-500`: try `git push`; on failure
   `git fetch origin main`, branch `chore/arch-snapshot-$(date +%s)` off `origin/main`,
   `git checkout "$OURS" -- "$TIMELINE"` to re-apply the captured series on top of latest main,
   re-check for an empty diff, push the branch, `gh pr create --base main`. No auto-approve, no
   auto-merge — a human reviews and merges.
7. **Duplicate-PR guard** (the one addition beyond the precedent, justified below): before creating
   a PR, list open PRs whose head branch starts with `chore/arch-snapshot-` and exit clean if one
   exists.

### Why the duplicate-PR guard was added

The precedents' commit-back jobs are event-driven (per-merge, per-release) and their artifacts are
regenerated **wholesale**, so a stale open PR is self-correcting. `timeline.json` is different: it is
**append-only** and this job is **weekly**. Without the guard, an unmerged week-1 PR and a fresh
week-2 PR would both append to the same JSON array from divergent bases and conflict on merge —
precisely the DIRTY-automated-PR failure mode `ci.yml:340-345` documents for `baselines.json`. Seven
lines prevent it and cost nothing when no PR is open.

The trade-off is recorded honestly: when a snapshot PR sits unmerged, subsequent weeks are **skipped
rather than queued**, so those weeks produce no data point. Skipping is the better failure — a gap in
the series is visible and recoverable; a pile of mutually-conflicting DIRTY PRs is neither. The step
logs `Snapshot PR #N is already open and unmerged` and exits green.

### Verification performed locally

- **YAML parse:** loads clean; top-level keys `name, on, concurrency, jobs`; job permissions resolve
  to `{"contents":"write","pull-requests":"write"}`; concurrency to
  `{"group":"architecture-snapshot","cancel-in-progress":false}`; 7 steps; commit-step `env` to
  `{"HUSKY":"0","GH_TOKEN":"${{ secrets.GITHUB_TOKEN }}"}`.
- **Shell syntax:** the `Commit snapshot` `run:` block extracted and checked with `bash -n` — clean.
- **Duplicate-PR guard, executed live** against this repo:
  `gh pr list --state open --json number,headRefName --jq '[.[] | select(.headRefName | startswith("chore/arch-snapshot-"))] | .[0].number'`
  returns empty and the guard correctly takes the `would-create` branch.
- **Root cause re-derived from primary evidence**, not accepted from the brief:
  `gh run list --workflow=snapshot.yml` -> 15/15 `failure`, all `schedule`, `2026-06-01` ->
  `2026-09-07`; `gh run view 34120963994 --log-failed` -> the GH013 rejection quoted above.

The end-to-end PR-fallback path can only be exercised by a real scheduled/dispatched run against the
protected branch; it is not locally reproducible. What _is_ proven locally is that the shape is
byte-for-byte the shape that already works in `ci.yml`, that the YAML and shell parse, and that the
one novel line (the `gh pr list` guard) executes correctly against the live repo.

---

## Remediation actions / assumptions made

**Actions taken**

1. Replaced the bare `git push` in `.github/workflows/snapshot.yml` with the repo's push-then-PR
   idiom, copied from `ci.yml` "Commit refreshed semantic shards".
2. Added `pull-requests: write` to the job permissions.
3. Added `HUSKY: '0'` and `GH_TOKEN` to the commit step.
4. Added `[skip ci]` to the snapshot commit subject.
5. Added a `concurrency:` group.
6. Added a duplicate-snapshot-PR guard.
7. Wrote this plan artifact plus `provenance.json` and `audit-session.md` under
   `docs/changes/arch-snapshot-commit-back/`.

**Assumptions**

- **Chose the no-PAT PR shape.** Three of the four working precedents self-approve with
  `secrets.BASELINE_AUTOAPPROVE_PAT` and auto-merge. The decision forbids adding a PAT, so the
  fourth precedent (`ci.yml` comprehension refresh: plain PR, `GITHUB_TOKEN` only, human merges) was
  used. **Consequence the reviewer must accept: the timeline no longer advances unattended.** Every
  week a human merges a small `chore: architecture snapshot` PR. If unattended advancement is
  wanted, the self-approve shape is a one-step upgrade — but it needs the PAT this lane was told not
  to add.
- **Assumed the branch-protection rule is permanent.** The fix does not attempt to bypass it; it
  tries the direct push first and falls back, so if the ruleset is ever relaxed the workflow
  silently takes the fast path with no further edit.
- **Assumed "ours" is the correct conflict resolution** when re-applying `timeline.json` onto latest
  main, matching the precedents' reasoning. This holds because `snapshot capture` appends to
  whatever main carried at checkout, so the captured file is a superset of main's series. The
  `concurrency:` group plus the duplicate-PR guard make a concurrent divergent append effectively
  impossible; without both, an append-only file would be a weaker fit for this idiom than the
  wholesale-regenerated artifacts the precedents handle.
- **Did not backfill the five missing months.** Historical points would require checking out and
  building 22 past commits; the series restarts from the next capture. The 2026-04-06 point is left
  in place as the anchor.
- **Did not add a staleness signal to the consumers.** `get_decay_trends` / `predict_failures` /
  `harness snapshot trend` still cannot tell a caller that the series is months old — the exact
  condition that let this failure hide for five months. That is a product change requiring design
  judgment, out of scope for an infra-config lane, and is reported as a follow-up.
- **Did not touch `holiday-confidence-track.yml` or `.harness/.gitignore`** (fork E1 — sibling lane).
- **Did not fix the dead `src/**`path filter** in the four`persona-\*.yml` workflows. It is a real
  ERROR-severity finding surfaced by this audit but a different defect class, and folding it in
  would make this PR unreviewable. Reported for separate triage.
- **Did not SHA-pin any action.** `snapshot.yml` matches the repo-wide mutable-tag convention; a
  one-workflow deviation would be noise. Reported as repo-wide INFO.
