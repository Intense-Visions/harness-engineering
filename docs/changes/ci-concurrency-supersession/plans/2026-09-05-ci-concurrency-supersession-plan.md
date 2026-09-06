# Plan: stop merge bursts from cancelling main's verification

**Date:** 2026-09-05 · **Source:** `harness-workflow-audit` run against `.github/workflows/` at base `c1ca02ba2` · **Tasks:** 5 · **Time:** ~20 min agent-effort · **Integration Tier:** small

No separate proposal exists: this is an infra/config remediation item derived directly from a workflow audit, and the audit findings below stand in for the spec.

## Goal

Make every commit that lands on `main` reach its own all-OS CI verdict, by giving push-to-`main` runs a per-commit concurrency group that is never cancelled — while leaving pull-request runs on their existing per-ref, cancel-in-progress group so a new push to a PR still supersedes the old run and no runaway parallelism is introduced. Secondarily, stop reporting windows/macOS test failures under an ubuntu-sounding step name.

## Audit findings (evidence)

Produced by the `harness-workflow-audit` pipeline (phases: inventory → mechanical → judgment → report). 22 workflow files inventoried; the two in remediation scope are `ci.yml` and `harness.yml`.

### [ERROR] concurrency-supersession · `.github/workflows/ci.yml:9-11`

`group: ${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`, on a workflow triggered by **both** `push: branches: [main]` and `pull_request: branches: [main]`.

On a push to `main`, `github.ref` is `refs/heads/main` for _every_ commit, so all main pushes collapse into one concurrency group and each new merge cancels the still-running verification of the previous commit.

Re-derived against the live API at audit time (`gh api .../workflows/ci.yml/runs?branch=main&event=push&per_page=30`):

- **22 `cancelled`**, 5 `failure`, 3 `success` — of the last 30 push-to-`main` runs.
- **Every one of the 30 is `run_attempt: 1`.** These are not reruns; they are commits whose verification was destroyed before it could produce a verdict.
- The mechanism is visible in a single burst: 14 pushes to `main` between `2026-09-06T01:14:52Z` and `01:21:43Z` (runs `34003390224`, `34003416641`, `34003428394`, `34003449722`, `34003530829`, `34003558821`, `34003579588`, `34003608478`, `34003641461`, `34003652098`, `34003661878`, `34003673303`, `34003692992`) all concluded `cancelled`; only the last in the burst, run `34004373791` (`180ebbb9c`), survived to `success`.

**Effect:** "main is green" is mostly _unverified_ rather than verified. This is a workflow-level trust defect, not a cosmetic one.

**Corroboration from inside the repo:** `scripts/main-health-check.mjs:31-32` already documents this defect as a standing condition it works around —

> `"Decisive" excludes cancelled and skipped runs. CI sets cancel-in-progress: true, so rapid merges leave a trail of cancelled runs`

`main-health.yml` consumes CI run conclusions via `workflow_run`, and `DECISIVE_CONCLUSIONS` (`scripts/main-health-check.mjs:92`) excludes `cancelled`. So the repo's own main-health alarm degrades to `INDETERMINATE` when a burst leaves too few decisive runs. The downstream workaround exists; this change removes its root cause.

### [ERROR] concurrency-supersession · `.github/workflows/harness.yml:9-11`

Identical defect: `group: harness-${{ github.ref }}`, `cancel-in-progress: true`, triggered on `push: branches: [main]` and `pull_request: branches: [main]`.

Re-derived against the live API: of the last 20 push-to-`main` runs, **13 `cancelled`, 7 `success`**.

### [WARNING] step-name-dishonest · `.github/workflows/ci.yml:79`

The step is named `Test (with coverage on ubuntu)`, but line 80 runs it on **all three** operating systems:

```yaml
run: ${{ matrix.os == 'ubuntu-latest' && 'pnpm test:ci' || 'pnpm test -- --continue' }}
```

**Effect:** every windows/macOS test failure in this repo is reported under an ubuntu-sounding step name, actively degrading triage — a failing Windows job's steps read as ubuntu-named or `UNKNOWN STEP`.

### Out of remediation scope, reported only

- `.github/workflows/benchmark.yml:7-9` and `.github/workflows/pr-advisory-checks.yml:23-25` carry the same group shape but are **`pull_request`-only**. Per-ref cancellation is correct there; **not** a defect, and deliberately untouched.
- Four further workflows carry `${{ github.workflow }}-${{ github.ref }}` + `cancel-in-progress: true` **and** a `push: branches: [main]` trigger, so they share the defect class: `persona-architecture-enforcer.yml:21-23` (also `develop`), `persona-documentation-maintainer.yml:19-21`, `persona-graph-maintainer.yml:17-19`, `persona-task-executor.yml:20-22`. These are **generated** files (`pnpm generate:persona-workflows:check` gates their freshness), so fixing them means changing their generator — a different change with a different blast radius. Filed as a follow-up rather than folded in here.
- `.github/workflows/release.yml:7-9` already uses `cancel-in-progress: false`. Existing in-repo precedent that never-cancel is the right posture for main-triggered work.
- Mechanical checks M1 (path filters — neither file in scope declares `paths:`/`paths-ignore:`), M3 (pinning — all `uses:` refs are first-party `actions/*` plus `pnpm/action-setup@v5` and `codecov/codecov-action@v5` on mutable major tags, consistent with repo convention), M5 (secret handling — no secret is echoed), and J1 (injection — `${{ github.event.pull_request.base.ref }}` is the only event interpolation reaching `run:`, and a base ref on a `branches: [main]`-filtered trigger is not attacker-controlled) produced no new findings in the two files in scope.

## Observable Truths (Acceptance Criteria)

Each truth names the command that proves it.

1. `.github/workflows/ci.yml` and `.github/workflows/harness.yml` both parse as valid YAML after the edit.
   **Gate:** `node -e "require('js-yaml').load(...)"` (or `python3 -c "import yaml; yaml.safe_load(...)"`) exits 0 for both files.
2. On a `pull_request` event, both workflows resolve to a **per-ref** group with `cancel-in-progress` **true** — PR runs are still superseded, so runner spend on the PR path is unchanged.
   **Gate:** expression review + the post-merge observation that pushing twice to a PR branch leaves exactly one live run.
3. On a `push` event, both workflows resolve to a **per-commit** (`github.sha`) group with `cancel-in-progress` **false** — no main run can cancel another.
   **Gate:** expression review; post-merge, a multi-commit burst on `main` leaves zero `cancelled` conclusions.
4. `cancel-in-progress` accepting an expression is confirmed against current GitHub documentation, not assumed.
   **Gate:** GitHub Actions workflow-syntax reference states _"you can specify `cancel-in-progress` as an expression with any of the allowed expression contexts"_, with the official example `cancel-in-progress: ${{ !contains(github.ref, 'release/') }}`. `concurrency.group` likewise accepts expressions over the `github`/`inputs`/`vars` contexts; `github.event_name`, `github.ref`, and `github.sha` are all in the `github` context.
5. The `A && B || C` ternary idiom is proven to work on **this repo's** GitHub instance rather than assumed.
   **Gate:** `.github/workflows/ci.yml:80` already ships the identical idiom (`${{ matrix.os == 'ubuntu-latest' && 'pnpm test:ci' || 'pnpm test -- --continue' }}`) and has been evaluating correctly in production.
6. Each changed `concurrency:` block carries a comment explaining **why**, citing the burst evidence, so the next reader does not "simplify" it back.
   **Gate:** `grep -B8 'cancel-in-progress' .github/workflows/ci.yml .github/workflows/harness.yml` shows the rationale comment.
7. The test step name no longer claims to be ubuntu-only.
   **Gate:** `grep -n 'Test (' .github/workflows/ci.yml` → `Test (coverage on ubuntu, --continue elsewhere)`.
8. The existing explanatory comment block above the test step (the `#1096` `--continue` rationale) is preserved byte-identically.
   **Gate:** `git diff` shows no change to lines 72-78.
9. No file outside `.github/workflows/ci.yml`, `.github/workflows/harness.yml`, and this plan artifact is modified.
   **Gate:** `git diff --name-only origin/main...HEAD` lists exactly three paths.
10. The change passes the repo's own pre-push gates without `--no-verify`.
    **Gate:** `git push` succeeds on the first non-bypassed attempt.

## Change Specification (delta)

**`.github/workflows/ci.yml:9-11` → replaced**

- [MODIFIED] `concurrency.group`: `${{ github.workflow }}-${{ github.ref }}` → `${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.ref || github.sha }}`
- [MODIFIED] `concurrency.cancel-in-progress`: `true` → `${{ github.event_name == 'pull_request' }}`
- [ADDED] A rationale comment block citing the burst evidence.

**`.github/workflows/harness.yml:9-11` → replaced**

- [MODIFIED] `concurrency.group`: `harness-${{ github.ref }}` → `harness-${{ github.event_name == 'pull_request' && github.ref || github.sha }}`
- [MODIFIED] `concurrency.cancel-in-progress`: `true` → `${{ github.event_name == 'pull_request' }}`
- [ADDED] The same rationale comment block.

**`.github/workflows/ci.yml:79`**

- [MODIFIED] step `name`: `Test (with coverage on ubuntu)` → `Test (coverage on ubuntu, --continue elsewhere)`
- [UNCHANGED — deliberately] the `run:` ternary on line 80 and the `#1096` comment block above it.

**Not changed, deliberately:** `benchmark.yml`, `pr-advisory-checks.yml` (PR-only, correct as-is); the four persona workflows (generated); `scripts/main-health-check.mjs` (out of lane scope — see Risks).

## Risk analysis

### R1 — Does removing cancellation on `main` create a push-back race? (analyzed, accepted)

This is the one non-obvious consequence and it drove the shape of the fix.

`ci.yml` has two jobs gated on `github.ref == 'refs/heads/main' && github.event_name == 'push'` that write back to the repository:

- `refresh-baselines` (`ci.yml:210`) — `needs: build-and-test`, `contents: write` + `pull-requests: write`, regenerates coverage/architecture baselines and pushes to `main` (with a `gh pr create` fallback, which is the live path because branch protection blocks direct pushes).
- `comprehension-refresh` (`ci.yml:381`) — additionally gated on the repo variable `HARNESS_COMPREHENSION_CI_REFRESH == 'true'`.

Today a merge burst cancels runs 1..n-1 during `build-and-test`, so `refresh-baselines` effectively runs once per burst. After this change it runs once per commit — concurrently.

**Why this is safe:** `refresh-baselines` is already hardened for exactly this concurrency, by prior fix `#671` ("Fix B", `ci.yml:315-320`), which bases the fallback PR branch on **the current tip of `origin/main`** rather than the run's own event SHA, precisely because _"concurrent refresh runs otherwise branch from divergent commits and conflict on the same baseline lines"_. It also carries two idempotent early exits — `"No baseline changes to commit."` and `"Latest main already carries these baselines; nothing to PR."` — so in a burst the first job wins and the rest no-op. Baselines are regenerated wholesale, so "ours" is always the correct resolution.

`comprehension-refresh` is **inert**: `gh api repos/.../actions/variables` returns no variables, so `HARNESS_COMPREHENSION_CI_REFRESH` is unset and the job is never scheduled.

**Why job-level concurrency was rejected as a mitigation:** the obvious hedge — give `refresh-baselines` its own stable concurrency group to collapse a burst back to one job — **reintroduces the exact defect being fixed**. A cancelled job makes its workflow run conclude `cancelled`, and `cancelled` is precisely what `DECISIVE_CONCLUSIONS` excludes, so main-health would go back to seeing non-decisive runs even though `build-and-test` had passed. `cancel-in-progress: false` does not escape this either: GitHub keeps only **one** pending run per concurrency group and cancels older pending ones, so a 14-commit burst still yields ~12 cancellations. Both variants trade the headline fix for a runner-minute saving. Rejected.

### R2 — Runner spend on `main` increases (accepted, by design)

Stated plainly rather than glossed: PR-path spend is unchanged, but main-path spend rises roughly in proportion to burst size — a 14-commit burst goes from ~1 completed verification to 14, each across 3 operating systems. That increase **is the fix**: verifying every commit necessarily costs more than verifying one in fourteen, and the current saving is purchased by not knowing whether `main` works. A merge queue would deliver the same guarantee more cheaply by testing batched candidates before they land; that is a materially larger architectural change and is recorded as a follow-up, not folded in here.

### R3 — Doc drift in `scripts/main-health-check.mjs` (reported, not fixed)

The comment at `scripts/main-health-check.mjs:31-32` says _"CI sets `cancel-in-progress: true`"_, which this change makes stale for the push path. The **logic is unaffected** — excluding `cancelled` from decisive conclusions stays correct; there will simply be far fewer such runs. `scripts/` is outside this change's declared file scope, so the comment is flagged for a follow-up rather than edited here.

## Tasks

1. **Run the audit.** Execute the `harness-workflow-audit` pipeline over `.github/workflows/`; inventory all 22 workflows; resolve triggers and concurrency blocks; re-derive the cancellation evidence against the live API. → findings above.
2. **Validate the expression forms** against current GitHub documentation (`cancel-in-progress` accepts expressions; `group` accepts `github`-context expressions) and against in-repo precedent for the `&& ||` ternary (`ci.yml:80`). → truths 4, 5.
3. **Apply the concurrency fix** to `ci.yml:9-11` and `harness.yml:9-11`, each with a rationale comment citing the burst evidence. → truths 2, 3, 6.
4. **Apply the step rename** at `ci.yml:79`, preserving the comment block above it. → truths 7, 8.
5. **Verify and ship.** YAML-parse both files, confirm the diff touches exactly three paths, commit, push without `--no-verify`, open one unmerged PR. → truths 1, 9, 10.

## Follow-ups (filed, not done here)

- Fix the same concurrency defect in the four generated persona workflows by changing their generator.
- Refresh the stale `cancel-in-progress: true` reference in `scripts/main-health-check.mjs:31-32`.
- Evaluate a merge queue as the cheaper long-term route to per-commit verification of `main`.
