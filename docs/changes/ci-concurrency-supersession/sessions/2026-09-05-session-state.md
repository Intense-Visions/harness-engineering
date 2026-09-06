# Session state: main-verification concurrency supersession remediation

**Fleet:** cicd-fleet · **Date:** 2026-09-05 · **Pipeline:** harness-workflow-audit
**Branch:** `fix/ci-concurrency-supersession` · **Base:** `origin/main` @ `c1ca02ba2` · **PR:** #1865

## Trigger

Not a single failing run — a **workflow-level trust defect** surfaced by auditing `.github/workflows/`.
Cause classification: **real-defect** (deterministic, config-caused; not flake, not infra).

`ci.yml` and `harness.yml` each trigger on **both** `push: [main]` and `pull_request: [main]` while
using a per-ref concurrency group with `cancel-in-progress: true`. On a push, `github.ref` is
`refs/heads/main` for every commit, so all main pushes share one group and each merge cancels the
previous commit's still-running verification.

| workflow      | window                      | `cancelled` | reached a verdict        | in scope |
| ------------- | --------------------------- | ----------- | ------------------------ | -------- |
| `ci.yml`      | last 30 push-to-`main` runs | **22**      | 8 (5 failure, 3 success) | yes      |
| `harness.yml` | last 20 push-to-`main` runs | **13**      | 7 success                | yes      |

All 30 `ci.yml` runs are `run_attempt: 1` — not reruns, but commits whose verification was destroyed.
One burst of 14 merges (`2026-09-06T01:14:52Z` .. `01:21:43Z`) left a single survivor, run
`34004373791` (`180ebbb9c`).

## Phase log

- **INVENTORY** — enumerated all 22 workflow files; recorded triggers, `concurrency:` blocks,
  `permissions:`, `uses:` refs, and `run:` scripts. Isolated the 6 workflows that combine a per-ref
  group with `cancel-in-progress: true` and a `push: [main]` trigger.
- **MECHANICAL** — M1 (path filters) n/a for the two files in scope (neither declares
  `paths:`/`paths-ignore:`). M3 (pinning): all `uses:` refs are first-party `actions/*` plus
  `pnpm/action-setup@v5` and `codecov/codecov-action@v5` on mutable major tags, consistent with repo
  convention. M4 (**concurrency safety**) fired — the headline finding. M5 (secrets): no secret is
  echoed. No new findings beyond M4.
- **JUDGMENT** — J1 (injection): `${{ github.event.pull_request.base.ref }}` is the only event
  interpolation reaching `run:`, and a base ref on a `branches: [main]`-filtered trigger is not
  attacker-controlled — not a finding. J2/J3 produced nothing new in scope. Separately identified the
  misnamed test step at what was `ci.yml:79` as a live triage-degrading defect.
- **CORROBORATE** — found that the repo already works around this defect downstream without ever
  root-causing it: `scripts/main-health-check.mjs:89-92` excludes `cancelled` from
  `DECISIVE_CONCLUSIONS`, commented _"CI sets `cancel-in-progress: true`, so rapid merges leave a
  trail of cancelled runs"_. `main-health.yml` consumes CI conclusions via `workflow_run`, so a burst
  degrades the alarm to `INDETERMINATE`.
- **VALIDATE** — confirmed against current GitHub docs that `cancel-in-progress` accepts an
  expression (official example: `cancel-in-progress: ${{ !contains(github.ref, 'release/') }}`) and
  that `concurrency.group` accepts `github`-context expressions. Confirmed the `A && B || C` idiom
  works on **this repo's** runners via existing in-file precedent (the `Test` step's `run:`).
- **FIX** — split both concurrency groups by event; renamed the misleading test step.

## Decisions taken autonomously (no human fork raised)

- **D1** — used the `A && B || C` idiom rather than the newer `case()` function (GA 2026-03-27).
  In-repo precedent proves the idiom on these runners; `case()` would be a marginal readability gain
  for nonzero syntax risk on a file whose failure mode is a total CI blackout.
- **D2** — fixed only `ci.yml` and `harness.yml`. `benchmark.yml` and `pr-advisory-checks.yml` share
  the group shape but are `pull_request`-only, where per-ref cancellation is **correct**, not a defect.
- **D3** — left the 4 same-defect **generated** persona workflows alone
  (`persona-architecture-enforcer`, `persona-documentation-maintainer`, `persona-graph-maintainer`,
  `persona-task-executor`); their freshness is gated by `generate:persona-workflows:check`, so the fix
  belongs in their generator. Filed as follow-up.
- **D4** — accepted increased runner spend on `main` as **the fix, not a side effect**. PR-path spend
  is unchanged; main-path spend scales with burst size (a 14-commit burst goes from ~1 completed
  verification to 14 × 3 OS). Verifying every commit necessarily costs more than verifying one in
  fourteen. A merge queue is the cheaper long-term route; filed as follow-up, too large here.
- **D5** — analyzed and accepted the push-back concurrency risk (see below). **Job-level concurrency
  was considered and rejected** as a mitigation.
- **D6** — did not touch `scripts/main-health-check.mjs`; its comment goes stale but its **logic stays
  correct**. Out of declared file scope; filed as follow-up.

## Risk analysis carried into the fix

Removing cancellation on `main` means `ci.yml`'s two main-only write-back jobs run once per commit
rather than once per burst. Resolved as safe:

- `refresh-baselines` is **already hardened for exactly this concurrency** by prior fix #671
  ("Fix B"), which bases the fallback PR branch on the current tip of `origin/main` rather than the
  run's event SHA, precisely because _"concurrent refresh runs otherwise branch from divergent commits
  and conflict on the same baseline lines"_. It also carries two idempotent early exits, so in a burst
  the first job wins and the rest no-op.
- `comprehension-refresh` is **inert** — gated on the repo variable
  `HARNESS_COMPREHENSION_CI_REFRESH` being `'true'`; `gh api .../actions/variables` returns no
  variables.
- **Why job-level concurrency was rejected:** it reintroduces the exact defect being fixed. A
  cancelled job makes its run conclude `cancelled`, which is precisely what `DECISIVE_CONCLUSIONS`
  excludes. `cancel-in-progress: false` does not escape it either — GitHub keeps only one _pending_
  run per group and cancels older pending ones, so a 14-burst still yields ~12 cancellations. Both
  variants trade the headline fix for runner minutes.

## Verification

| Gate                                                   | Evidence                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Both workflow files parse as valid YAML after the edit | `yaml.parse()` on both → PASS; groups and `cancel-in-progress` read back as the intended expressions                                 |
| push → per-commit group, never cancelled               | `group` contains `github.sha` on the non-PR branch of the ternary; `cancel-in-progress` false when not a PR                          |
| PR → per-ref group, cancel-in-progress ON              | `group` contains `github.ref` on the PR branch; `cancel-in-progress` → `github.event_name == 'pull_request'`                         |
| **Expression evaluates on the live GitHub instance**   | PR #1865 **scheduled jobs** across all 3 OS — a malformed expression yields `startup_failure` with no jobs                           |
| Rationale comment present above each block             | both blocks carry a comment citing the burst evidence and naming the cancel/no-cancel split                                          |
| Test step name is OS-honest                            | `ci.yml:101` → `Test (coverage on ubuntu, --continue elsewhere)`                                                                     |
| `#1096` `--continue` comment block preserved           | `git diff` shows no change to the comment block above the step; `run:` ternary untouched                                             |
| Diff scope                                             | `git diff --name-only c1ca02ba2..HEAD` → exactly 3 paths, none in a forbidden region                                                 |
| `pnpm format:check`                                    | "All matched files use Prettier code style!"                                                                                         |
| Shipped without bypass                                 | commit + push passed the arch gate, lint-staged, comprehension compile, `generate-docs --check`, tool-catalog — **no `--no-verify`** |

No gate weakened, skipped, or deleted. No workflow file outside the two in scope was modified.

## Follow-ups filed

- Same concurrency defect in the 4 generated persona workflows → fix via their generator.
- Stale `cancel-in-progress: true` reference at `scripts/main-health-check.mjs:31-32`.
- Evaluate a merge queue as the cheaper long-term route to per-commit verification of `main`.

## Status

`resolved` — PR #1865 open and **unmerged**. Terminal act of this lane is the unmerged PR; landing is
the human's decision.
