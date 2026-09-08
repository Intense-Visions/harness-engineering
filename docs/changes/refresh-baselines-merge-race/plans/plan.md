# Plan — `refresh-baselines` reds `main` on an auto-merge race (cicd-fleet R1)

Trace of the `harness-workflow-audit` run (inventory → mechanical → judgment → report) and the
remediation it produced, executed autonomously in a cicd-fleet remediation lane.

Scope: `.github/workflows/ci.yml`, job `refresh-baselines`, step `Commit refreshed baselines`.
Pinned base SHA: `db9c6739da57f6dd38a2e9d83bf94a1bfce9ca7b`.

## Symptom (observed, not inferred)

The `refresh-baselines` job has reddened `main` three times in three days:

| Run           | Date       | main SHA   |
| ------------- | ---------- | ---------- |
| `34227768312` | 2026-09-08 | `fe2895b5` |
| `34042737396` | 2026-09-06 | `c83050a3` |
| `34042651655` | 2026-09-06 | `9eed8eb0` |

Each failed with the identical verbatim error:

```
GraphQL: Base branch was modified. Review and try the merge again. (mergePullRequest)
##[error]Process completed with exit code 1.
```

The failing command was the **last line** of the `Commit refreshed baselines` step:

```sh
gh pr merge "$PR_URL" --auto --squash --delete-branch
```

A red `refresh-baselines` also fires the `Main Health Alarm` workflow, so the noise is not
confined to one run's log.

## Root cause

This repository has **no `required_status_checks` branch rule at all** — only a ruleset requiring
one approving review. `gh pr merge --auto` (GitHub auto-merge) only _queues_ the merge when there
is something still pending to wait on. Here the single requirement (one approval) is satisfied
**inline on the line immediately above** by the PAT self-approval, so at the moment `--auto` is
called there is nothing left to wait for and GitHub attempts an **immediate** merge.

If `main` advanced between the earlier `gh pr create` and this merge call — which happens
constantly under a merge burst — the `mergePullRequest` GraphQL mutation is rejected with
"Base branch was modified", the step exits non-zero under `bash -e`, and **`main` goes red**.

Aggravating factor (workflow-level, deliberate, and **not** changed here): `ci.yml`'s concurrency
group is per-**commit** on the `push` event (`github.sha`), specifically so that a merge burst
cannot cancel a previous commit's verification. A necessary consequence is that
`refresh-baselines` runs **concurrently** across commits in a burst, so several runs are racing
the same `main` tip. See the pushback-serialization finding below.

## Audit findings (harness-workflow-audit, scoped to the `refresh-baselines` job)

```
WORKFLOW AUDIT: harness-engineering — .github/workflows/ci.yml (job: refresh-baselines)
Workflows in tree: 22   Findings (this job): 1 error, 2 warning
Gates that never fire: none in this job
Documented-but-unwired gates: none in this job
```

### [ERROR] pushback-race — `.github/workflows/ci.yml:379` (pre-fix line number)

`gh pr merge "$PR_URL" --auto --squash --delete-branch` is the terminal command of a `bash -e`
step, with no retry and no tolerance for a concurrently-advancing base. With no
`required_status_checks` rule, `--auto` degrades to an immediate merge, so the documented
GitHub failure mode "Base branch was modified" propagates straight out as a red job on `main`.
Evidence: the three runs above, all with the same verbatim GraphQL error.

**Effect:** a post-merge bookkeeping job fails the default branch and trips the main-health alarm,
for a race that carries no lost work whatsoever.

**Patch:** applied — bounded retry with re-derivation, then close-and-abstain (below).

### [WARNING] pushback-serialization — `.github/workflows/ci.yml:31`

The push-event concurrency group is per-commit by design (documented at length in the file, with
measured evidence: 22 of the last 30 push runs concluded `cancelled` under the old per-ref group).
The side effect is that the _push-back_ job `refresh-baselines` is unserialized and races itself.
A **job-level** `concurrency:` group on `refresh-baselines` alone (`cancel-in-progress: false`)
would serialize the refreshes without touching the deliberate per-commit verification behaviour.

**Not applied here** — out of scope for this item, and it would not fully close the race anyway
(`main` also advances from ordinary PR merges, not only from other refresh runs). Recorded as an
adjacent finding for a follow-up issue.

### [WARNING] ratchet-refresh-fragility — `.github/workflows/ci.yml:302`

The single authoritative post-merge baseline updater has no abstain path: every failure mode in
its tail is a red `main`. The remediation gives it one for the race case specifically.

Mechanical checks that came back **clean** for this job: M2 permission scoping (`contents: write`
and `pull-requests: write` are both exercised — direct push, and `gh pr create`/`review`/`merge`);
M3 pinning (all `actions/*` first-party, tag-pinned per repo convention); M4.2 re-trigger guard
(`[skip ci]` present in the commit subject); M5 secret handling (`AUTOAPPROVE_PAT` reaches `gh`
through `env:` and is never echoed); J1 injection (no `github.event.*` interpolation in this job's
`run:` scripts).

## The one design fork, and the human's decision

> **F1 — what happens to the baseline-refresh PR when the retries are exhausted?**
> (a) close it and exit clean, or (b) leave it open for a human.

The human chose **(a) close the superseded baseline PR and exit clean; the next merge regenerates
it.**

Rationale (preserved verbatim in the workflow comment): `.harness/**/baselines.json` uses a
`merge=ours` custom merge driver, so a **stale** baseline PR resolves in the PR's favour — landing
it later would **REVERT** `main`'s newer baselines. A superseded baseline-refresh PR is therefore
_actively dangerous_, not merely stale. Leaving it open to accumulate is the wrong answer; closing
it is correct because the very next merge to `main` regenerates a fresh one.

## Fix applied

In `Commit refreshed baselines`, the PR-fallback tail is restructured into two shell functions plus
a bounded retry loop, matching the house style already proven in
`.github/workflows/holiday-confidence-track.yml` (step `Commit the trend ledger`, which uses
`for attempt in 1 2 3` with a re-fetch and a hard reset between attempts).

1. **`rebuild_branch_on_main`** — factors out the existing "Fix B" branch construction (fetch
   `origin/main`, `checkout -B "$BRANCH" origin/main`, re-apply `$BASELINE_FILES` from `$OURS`,
   re-apply the transient-allowance deletions, commit). Returns non-zero when the new tip already
   carries these baselines, i.e. nothing is left to propose. Used both for the initial PR branch
   and for each retry, so a retry re-derives on the newer tip instead of blindly repeating.
   Safe by construction: the baseline files are regenerated **wholesale**, so "ours" is always the
   correct resolution and the re-apply cannot conflict.
2. **`approve_pr`** — the unchanged #531 scope guard
   (`assert-baseline-only-diff.mjs`, fail-closed) followed by the PAT self-approval. Re-run after
   each force-push, because a force-push can dismiss the inline approval.
3. **Retry loop** — `for attempt in 1 2 3`, `sleep 5` between attempts (the existing idiom).
   On a merge failure: re-derive on the fresh tip, `git push --force-with-lease` the same branch
   (same PR, same URL — never a second PR), re-approve, retry.
4. **Abstain paths** — if a re-derivation finds `main` already carries these baselines, or the
   force-push loses its lease, or all three attempts are exhausted: emit a `::notice::`,
   `gh pr close --delete-branch` with an explanatory comment, and `exit 0`.

### Why this is an abstain, not a swallowed failure

Nothing is lost: the baseline content this run computed is, by then, either already on `main` or
superseded by a fresher refresh that a later merge will regenerate. The outcome is stated in the
run log as a `::notice::` annotation and as a comment on the closed PR, so it is visible rather
than hidden. This is the same posture `holiday-confidence-track.yml` already takes when its KPI
abstains.

### Explicitly NOT done (gate violations for this fleet)

- No `|| true` appended to the merge.
- The `assert-baseline-only-diff.mjs` scope guard (#531) is unchanged and still fails closed; it is
  re-run on every retry rather than skipped.
- The PAT self-approval guard is unchanged.
- The deliberate per-commit push concurrency group is untouched.

## Regression guard

`tests/scripts/baseline-gating.test.mjs` already exists specifically as the "refresh-baselines
auto-merge race" regression test (its header documents #671). Three assertions are added there over
the workflow text, since the defect lives in the YAML rather than in a script:

- the `gh pr merge` call is inside a bounded `for attempt in 1 2 3` retry;
- retry exhaustion closes the PR and exits 0 (abstain), rather than leaving it open;
- the merge is not neutralised with `|| true`, and the `#531` scope guard is still invoked.

Run with `node --test 'tests/scripts/*.test.mjs'` — already wired into `ci.yml` as the
"Baseline-gating regression test" step.

## Deviation from the audit skill's gate

`harness-workflow-audit` states "Do not modify workflow files — this skill audits and proposes
patches." This lane's mandate is remediation, so the proposed patch is applied here in a lane
branch and lands only through a human-reviewed PR; it is never auto-merged. The audit's intent
(no unreviewed auto-application of CI changes) is preserved.

## Follow-ups (not in this diff)

- File an issue for the **job-level concurrency group** on `refresh-baselines`
  (`concurrency: { group: refresh-baselines, cancel-in-progress: false }`) to serialize refreshes
  and shrink the race window that this retry loop absorbs.
- Consider whether the repo _should_ have a `required_status_checks` rule at all — its absence is
  what turns `--auto` into an immediate merge here, and it has broader implications than this job.
