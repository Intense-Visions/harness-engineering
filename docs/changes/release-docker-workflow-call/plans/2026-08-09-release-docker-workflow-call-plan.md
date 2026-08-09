# Plan: fix the Release workflow's `docker` job never starting on a real publish

**Date:** 2026-08-09 · **Spec:** `docs/changes/release-docker-workflow-call/proposal.md` · **Tasks:** 4 · **Time:** ~20 min · **Integration Tier:** small

## Goal

Make the `docker` job in `release.yml` actually dispatch on a real publish by removing the
concurrency-group collision between the called `docker.yml` workflow and its caller. The
container-publish path has never executed once in the repository's history; this change removes
the single mechanical reason it cannot start.

## Root Cause (established, not assumed)

Under `workflow_call`, `${{ github.workflow }}` resolves to the **caller's** workflow name.
`docker.yml` declares `group: ${{ github.workflow }}-${{ github.ref }}`, which therefore
evaluates to `Release-refs/heads/main` — identical to the group the in-flight caller `Release`
run already holds (`release.yml` declares the same expression with `cancel-in-progress: false`).
A called workflow demanding a group its own caller holds is a deadlock; GitHub terminates the
run instead of queueing it, so no `docker` job record is ever created.

### Evidence that CONFIRMS the concurrency hypothesis

1. **The failure is instantaneous, not a hang.** Run `31323256027` has `updated_at`
   2026-08-09T16:19:07Z against a `release` job that completed at 16:19:05Z — the run concluded
   two seconds after its dependency finished. A queued-forever concurrency wait would leave the
   run `in_progress`; a deadlock that GitHub detects and terminates looks exactly like this.
2. **The job record is absent, not skipped.** The run reports `total_count = 2`. Across the
   eight most recent Release runs, every other run reports `total_count = 3` with `docker` present
   as `skipped` — including runs where the `release` job **failed**. So job-record creation and
   `if:` evaluation both work in the false case; only the true case (real dispatch) breaks.
3. **Exclusivity.** `31323256027` is the only run in the window where `release` both succeeded
   and actually published, and it is the only run missing the `docker` record.
4. **Documented GitHub semantics.** GitHub's documentation states the `github` context in a
   called workflow is associated with the caller, and that a called workflow uses its caller's
   name in `${{ github.workflow }}`. Identical groups between a top-level workflow and a job
   produce a documented deadlock termination.

### Evidence that REFUTES the competing hypotheses

- **Empty required input — REFUTED.** The run log for the `Extract CLI version for Docker` step
  shows `publishedPackages` expanded to a full array and the CLI version resolving to `11.1.1`.
  The job epilogue logs `Set output 'published'` and `Set output 'version'`. Both outputs were
  populated, so `with: version:` did not receive an empty value.
- **Missing `secrets: inherit` — REFUTED.** `docker.yml` consumes only `secrets.GITHUB_TOKEN`,
  which GitHub provides to called workflows automatically. `secrets: inherit` governs
  user-defined secrets, and a missing secret is a runtime failure, not a dispatch failure.
- **Job-level `permissions:` on a `uses:` job — REFUTED.** Job-level `permissions` on a calling
  job is the supported pattern, and the grant (`contents: read`, `packages: write`) is a subset
  of the caller workflow's grant, matching `docker.yml`'s own top-level block.
- **Zero `workflow_call` runs in history — NOT EVIDENCE.** A reusable workflow invoked via
  `workflow_call` does not create its own workflow run; its jobs appear inside the caller's run.
  Zero such runs is expected regardless of cause, so this observation is non-diagnostic and was
  discarded rather than counted in favour of any hypothesis.

## Observable Truths (Acceptance Criteria)

1. The **value** of `concurrency.group` in `.github/workflows/docker.yml` no longer contains
   `github.workflow`. The explanatory comment above it deliberately names the expression, so a
   plain file-wide grep is not the right gate. **Gate:** parse the YAML and assert
   `'github.workflow' not in doc['concurrency']['group']`.
2. The concurrency group is a literal-prefixed expression that cannot collide with any caller.
   **Gate:** the group reads `docker-${{ github.ref }}`.
3. Both workflow files remain valid YAML with an unchanged job graph. **Gate:** YAML parse of
   both files succeeds; `release.yml` still declares jobs `ci-gate`, `release`, `docker`.
4. A comment at the changed line records why `${{ github.workflow }}` must not be reintroduced,
   so the defect is not re-added by a future edit. **Gate:** comment present above the group.
5. Repository formatting and CI gates pass. **Gate:** `pnpm format:check`, and all-OS CI green
   on the branch.

## Tasks

1. **Replace the colliding concurrency group in `docker.yml`** with `docker-${{ github.ref }}`
   and add the explanatory comment. Single-line semantic change.
2. **Leave `release.yml` unmodified.** Its own concurrency group is correct for a top-level
   workflow; the collision is entirely a property of the callee's expression.
3. **Record the audit + plan artifacts** under `docs/changes/release-docker-workflow-call/`.
4. **Run local gates** (`pnpm format:check`, YAML parse) and open the PR without merging.

## Uncertainties

- [ASSUMPTION] The literal prefix `docker-` is used rather than a hardcoded full name, matching
  the pattern the GitHub community recommends for reusable workflows. Any literal distinct from
  the caller's workflow name works; this one is descriptive and stable.
- [ASSUMPTION] `cancel-in-progress: false` is retained. A container publish should not be
  cancelled midway by a subsequent release, and changing it is not required by the root cause.
- [ASSUMPTION] The `smoke-test` job and the 4-way build matrix are left untouched; the Dockerfile
  targets `cli`, `mcp-server`, `orchestrator`, `dashboard` and `scripts/docker-smoke-test.sh` all
  exist, so nothing downstream of dispatch is known to be broken.
- [RESIDUAL RISK] The literal error string GitHub emitted for the failed dispatch could not be
  retrieved. Run-level dispatch errors are not exposed through the REST API (the check suite
  lists only the two real jobs, and no annotation is attached), and the run's HTML page is not
  machine-readable from here. The diagnosis therefore rests on the timing signature, the
  absent-versus-skipped job record, exclusivity to the publishing run, and documented GitHub
  semantics — all four of which agree — rather than on a quoted error message.
- [OUT OF SCOPE] Backfilling container images for already-published versions. `docker.yml` runs
  `build-push-action` with `push: true` and a `latest` tag, so exercising it publishes real
  images. That is a human decision and is not taken here.

## Verification Caveat

This defect reproduces only on a real publish, which a PR branch cannot trigger. All-OS CI green
on this branch does **not** prove the container-release path works. The publish path remains
unproven until the next real release.
