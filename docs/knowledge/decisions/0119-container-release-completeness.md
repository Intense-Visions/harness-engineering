---
number: 0119
title: Container publish is a warn-only in-band release step; backfill is latest-only
date: 2026-09-05
status: proposed
tier: medium
source: 'decision-blocked issue #1258'
---

## Context

`@harness-engineering/cli` shipped many npm versions while the org container registry
stayed empty: **no container image had ever been published for any released CLI
version** (#1258). Two separable things were wrong, and only one of them was a defect.

**The mechanical cause — fixed.** `docker.yml` declared its concurrency group as
<code v-pre>${{ github.workflow }}-${{ github.ref }}</code>. Under `workflow_call` the `github` context
belongs to the _caller_, so that expression evaluated to the caller's name and the
called workflow demanded `Release-refs/heads/main` — the group the still-in-flight
`Release` run already held. GitHub kills that deadlock rather than queueing it, so no
`docker` job record was ever created. PR #1257 (merged 2026-08-09) changed the group to
the literal-prefixed <code v-pre>docker-${{ github.ref }}</code>;
`.github/workflows/docker.yml:29-31` carries the fix and `:18-28` the comment recording
the hazard.

**The residual policy question — this ADR.** #1257 unblocked the path going forward but
deliberately decided nothing about (a) what should happen when a container build fails
_after_ npm has already published, and (b) whether images should be backfilled for
versions already released.

Current wiring, verified: `.github/workflows/release.yml:178-186` declares

```yaml
docker:
  needs: release
  if: needs.release.outputs.published == 'true'
  uses: ./.github/workflows/docker.yml
  with:
    version: ${{ needs.release.outputs.version }}
  permissions:
    contents: read
    packages: write
```

with **no `continue-on-error`** — the job carries exactly `needs`, `if`, `uses`, `with`,
`permissions`. Because `docker` runs `needs: release`, and `release` is the job that
publishes to npm (`release.yml:41-46` exposes `published`/`version` off the changesets
step), a container failure today **reds the Release run after the packages have already
shipped**. npm is out; the run reports failure.

**This is no longer hypothetical.** Release run `33965602127` (2026-09-05, CLI
`12.3.0`) is the first real publish to exercise #1257's fix. It reports 7 jobs:

| job                                                                  | conclusion  |
| -------------------------------------------------------------------- | ----------- |
| `ci-gate`                                                            | success     |
| `release`                                                            | success     |
| `docker / build-and-push` (cli, mcp-server, orchestrator, dashboard) | success x4  |
| `docker / smoke-test`                                                | **failure** |

Two facts follow, and both revise #1258's stated premises:

1. **Images now exist.** All four `build-and-push` matrix legs succeeded with
   `push: true`, tagging full/minor/major/`latest` (`docker.yml:83-92`), and the
   downstream `smoke-test` job pulled them successfully. The registry is no longer
   empty — `12.3.0` is published.
2. **The predicted failure mode fired on the first attempt.** The run is red _after_ a
   successful npm publish — exactly the situation #1258's open question 4 asked about.

The smoke run reports **3 passed / 3 failed / 4 skipped**
(`scripts/docker-smoke-test.sh` under `--skip-build --skip-compose`, invoked at
`docker.yml:120-121`). The three failures are not one kind of thing:

- _Orchestrator image size_ — a **budget** breach, not a broken image
  (`scripts/docker-smoke-test.sh:23` sets `MAX_IMAGE_SIZE_MB=800`; the comparison and
  its `fail` are at `:162-163`).
- _CLI `--version`_ — a real functional failure (`:183`).
- _MCP stdio initialize_ — a real functional failure (`:196`).

A hard gate here would therefore let a **size-budget** overrun block a release.

**A constraint that shapes the answer.** Warn posture cannot be bought with one keyword.
GitHub does **not** support `continue-on-error` on a job that calls a reusable workflow
with `uses:`; it is absent from the supported key set for such jobs and remains an open
feature request. `release.yml:181` is this repo's **only** reusable-workflow call —
`grep -rn "uses: \./\.github/workflows" .github/workflows/` returns that single line — so
there is no in-repo precedent to copy. Step-level advisory posture, by contrast, is a
well-established house pattern, including inside this very workflow at
`release.yml:31-39`, where the golden-build drift report is explicitly advisory via
`|| echo "::warning::..."`, and at `pr-advisory-checks.yml:87,144,149`,
`required-review.yml:36,74,85`, and `ci.yml:159,182,196`.

## Decision

**1. Container publish is a warn-only, in-band step of the Release run.** It stays a job
of the Release workflow — not moved out-of-band — and it **never reds the Release run**.
A failed container build or smoke test surfaces as a _visible warning_: `::warning::`
annotations plus a job-summary entry on the Release run. It is neither blocking nor
silently swallowed.

Because `continue-on-error` is unavailable on the `uses:` job (see Context), the posture
is implemented **in the callee**: `docker.yml` gains a `soft_fail` boolean
`workflow_call` input defaulting to `false`, and `release.yml:178-186` passes
`soft_fail: true` alongside `version`. When `soft_fail` is true, the build/push and
smoke steps report failure as warnings and their jobs conclude successfully. The
standalone entrypoints — tag push and `workflow_dispatch` (`docker.yml:3-11`) — keep the
default `false` and continue to **fail hard**, preserving an honest red signal exactly
where a human is watching for it.

Rationale: the release's job is to ship the packages. The container publish is a
downstream artifact of that release, not a precondition for it — npm has already
published by the time `docker` runs. A red run at that point communicates nothing
actionable about the npm release while actively degrading the trustworthiness of the
Release signal for everything else. Warn keeps the failure visible without making the
release status lie.

**2. Publish ordering is unchanged; the gate does not move upstream of npm.** `docker`
continues to run `needs: release`. Making container publish blocking would require
reordering it ahead of the npm publish, and that trade — a size-budget overrun or a
transient registry hiccup delaying an npm release — is rejected.

**3. Backfill is latest-only, and is already satisfied.** Images are published for the
**current** release and nothing older. There is no historical backfill: versions at or
below `12.2.x` remain permanently imageless, and that is accepted rather than
remediated. This requires **no separate action** — run `33965602127` already pushed all
four images at `12.3.0` plus the `latest`/minor/major tags through the normal release
path. The latest-only scope is therefore satisfied _by the release path itself_, which
is the intended steady state. A manual `workflow_dispatch` of `docker.yml` is the
fallback only if a future release's `build-and-push` legs fail; when used, it must be
dispatched at the **release tag's ref**, not at `main`, because `docker.yml:56` checks
out the dispatch ref and would otherwise label a `main` tree with a released version.

**4. Container-build health is an investigation, not part of this decision.** #1258's
open question 3 ("is the container build itself healthy?") is answered _empirically but
only partially_ by run `33965602127`: `build-and-push` is healthy (4/4 green),
`smoke-test` is not (3 failed). Diagnosing and fixing the three named failures is
recorded as a consequence and follow-up below, not decided here.

**Assumptions made (recommended-option defaults):** the two forks were answered by the
human at the fleet's CONFIRM round and are adopted as decided — **gate posture = warn
only** (not blocking, not out-of-band, not silently ignored) and **backfill scope =
latest only** (no full-history backfill). Everything else here is derived from those two
answers plus the verified evidence above. The `soft_fail`-input mechanism is this ADR's
own recommended default for _how_ to implement warn, given that `continue-on-error` is
unavailable on the `uses:` job; it is a mechanism choice, and an equivalent warn posture
achieved by another mechanism satisfies this decision equally.

## Consequences

- **Positive:** the Release run's status becomes honest again — red means the npm
  release itself is in trouble, not that a container image is 727MB instead of 800MB.
  The container failure stays visible as an annotation on the run rather than
  disappearing, so the warn posture does not become silent rot the way the dispatch
  deadlock did for months. Keeping the call in-band (rather than out-of-band) preserves
  the causal link between a specific release and its images — same run, same version
  input, one place to look.
- **Positive:** scoping `soft_fail` to the `workflow_call` path keeps the tag-push and
  `workflow_dispatch` entrypoints hard-failing, so the standalone Docker workflow remains
  a trustworthy red/green signal for anyone deliberately exercising the container build.
- **Negative / tradeoffs:** a warn is easier to ignore than a red. The container publish
  can now degrade silently-in-practice if nobody reads Release-run annotations, which is
  the same class of neglect that let this gap persist for the entire life of the
  workflow. Mitigation is that the warning is on the Release run itself — the run
  everyone already watches after a publish — not on a separate workflow nobody opens.
- **Negative / tradeoffs:** implementing warn in the callee is more machinery than a
  one-line `continue-on-error`, and the `soft_fail` input adds a second behavioural mode
  to `docker.yml` that must be kept correct in both states. This cost is forced by the
  GitHub constraint, not chosen.
- **Negative:** latest-only backfill leaves a permanent hole in the published history.
  Anyone pinning a container image to a CLI version at or below `12.2.x` will find
  nothing, and the registry's earliest image will not correspond to the package's
  earliest release. Accepted deliberately: those images were never available, so nothing
  regresses, and rebuilding historical trees is speculative work with no known consumer.
- **Neutral:** the decision changes no publishing behaviour for npm and does not touch
  the `release` job. `docker.yml`'s matrix, tags, and smoke invocation are unchanged.
- **Reversibility: high.** The posture is a boolean input and a guard on two steps.
  Flipping to blocking later means removing `soft_fail: true` from the caller (and, for a
  true blocking gate, reordering `docker` ahead of the npm publish, which is the larger
  change). Widening the backfill later is a series of `workflow_dispatch` runs at old
  tags — no code change at all.
- **Follow-up (investigation, routed separately):** diagnose the three `smoke-test`
  failures observed in run `33965602127` — orchestrator image exceeding the 800MB budget
  (`scripts/docker-smoke-test.sh:23`), `CLI --version` not printing a semver (`:183`),
  and `MCP stdio initialize` not returning `serverInfo` (`:196`). Decide per failure
  whether the image, the assertion, or the budget is wrong; the orchestrator size check
  in particular may be a stale budget rather than a defect.
- **Follow-up (hardening, carried from #1257):** `docker.yml:69-76` interpolates
  <code v-pre>${{ inputs.version }}</code> directly into a `run:` script instead of passing it through
  `env:`. Low severity, deliberately left out of #1257 to keep that fix single-cause;
  still open.
- **Follow-up (observability):** because tags are created by the changesets action using
  `GITHUB_TOKEN`, the `push: tags:` trigger at `docker.yml:4-5` does not fire on release
  tags — token-created events do not dispatch workflows. The `workflow_call` path is
  therefore the only live release path, and the tag trigger is effectively dead for
  automated releases. Worth either documenting as dispatch-only or removing.

## Alternatives Considered

- **Block the release on the container publish.** Reorder `docker` ahead of the npm
  publish so a failed image build stops the release. Rejected — it inverts the
  dependency between the product (npm packages) and a downstream artifact, and run
  `33965602127` shows exactly why: one of the three smoke failures is an image-size
  budget breach (`scripts/docker-smoke-test.sh:23,162-163`), which would have held back a
  perfectly good `12.3.0` npm release over 800MB of orchestrator image.
- **Run the container publish out-of-band.** Have the `release` job fire `docker.yml`
  via `workflow_dispatch` and not wait for it. Rejected — it makes the failure invisible
  in the release's own record and reintroduces exactly the failure mode #1258 documents,
  where a dead container path went unnoticed across the entire life of the workflow
  because nothing in the release surfaced it. Warn keeps it in the run; out-of-band
  removes it from the run.
- **Inline the container matrix into `release.yml` with job-level
  `continue-on-error: true`.** This is the shape that _would_ work if
  `continue-on-error` were available, and it uses a supported keyword rather than a new
  input. Rejected — it forks the container-build definition, leaving `docker.yml`'s
  `workflow_dispatch` and tag-push entrypoints (`docker.yml:3-11`) either duplicated or
  divergent from what the release actually builds. The `soft_fail` input keeps one
  definition with two postures instead of two definitions.
- **Full-history backfill of every released version.** Rejected per the human's answer
  at CONFIRM, and independently weak on its merits: it would require checking out and
  building dozens of historical trees whose Dockerfiles and lockfiles may no longer
  build, to produce images no consumer has ever asked for.
- **Do nothing and accept red release runs.** Rejected — it trains readers to ignore a
  red Release run, which is the one signal that must stay trustworthy after a publish.

## References

- Resolves: #1258 (container images have never been published for any released CLI
  version — release-completeness gap). This ADR answers its open questions 1, 2, and 4;
  question 3 is recorded as an investigation follow-up, not decided.
- Builds on: #1257 (merged 2026-08-09) — fixed the `workflow_call` concurrency-group
  deadlock that made the `docker` job undispatchable, unblocking this path going forward.
- `.github/workflows/release.yml:178-186` — the `docker` job: `needs: release`,
  `if: needs.release.outputs.published == 'true'`, `uses: ./.github/workflows/docker.yml`,
  with **no `continue-on-error`**. The line range this ADR changes the posture of.
- `.github/workflows/release.yml:41-46` — the `release` job's `published` / `version`
  outputs, establishing that `docker` runs strictly after the npm publish.
- `.github/workflows/release.yml:31-39` — in-workflow precedent for warn posture: the
  golden-build drift report, advisory via `|| echo "::warning::..."`.
- `.github/workflows/docker.yml:18-31` — the concurrency-group fix from #1257 and the
  comment recording the caller-context hazard.
- `.github/workflows/docker.yml:3-11` — the `push: tags:` and `workflow_dispatch`
  entrypoints that retain hard-fail posture (and the `workflow_dispatch` `version` input
  that any manual backfill would use).
- `.github/workflows/docker.yml:83-92, 120-121` — the tag set pushed per target and the
  smoke-test invocation.
- `scripts/docker-smoke-test.sh:23, 162-163, 183, 196` — the 800MB image-size budget and
  the three checks that failed in run `33965602127`.
- Release run
  [`33965602127`](https://github.com/Intense-Visions/harness-engineering/actions/runs/33965602127)
  (2026-09-05, CLI `12.3.0`) — first real publish after #1257; four `build-and-push` legs
  green, `smoke-test` red, run red after npm shipped.
- GitHub Actions does not support `continue-on-error` on a job that calls a reusable
  workflow: [community discussion #159265](https://github.com/orgs/community/discussions/159265),
  [community discussion #77915](https://github.com/orgs/community/discussions/77915).
