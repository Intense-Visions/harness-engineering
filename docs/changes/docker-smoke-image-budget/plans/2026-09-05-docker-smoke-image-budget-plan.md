# Plan: raise the Docker smoke-test image-size budget

**Date:** 2026-09-05 · **Trigger:** Release run `33965602127`, job `101306280873` (`docker / smoke-test`), sha `851a5e4e` · **Tasks:** 3 · **Time:** ~10 min · **Integration Tier:** small

Remediation for one of three assertion failures in the first-ever release-path execution of the
`docker / smoke-test` job. The other two failures (CLI `--version`, MCP stdio) are a distinct root
cause and ship as a separate PR off `main` — this plan deliberately does not touch them.

## Goal

Give `MAX_IMAGE_SIZE_MB` in `scripts/docker-smoke-test.sh` enough headroom that it functions as a
tripwire against structural packaging regressions rather than as a scheduled failure, and record why
the chosen number is the number.

## Context

The failing run measured: CLI 727MB (PASS), MCP 727MB (PASS), Dashboard 482MB (PASS),
Orchestrator 815MB (**FAIL**, limit 800MB).

The orchestrator stage is `FROM cli` plus an `apt-get install git curl` layer (`Dockerfile:107-112`),
so its size is structurally `cli + ~88MB`. The CLI image is the growth driver; the orchestrator is
the image that crosses any budget first.

Commit `aeb815856` ("fix(docker): raise smoke test image size limit to 800MB") already raised this
constant once, from 400MB, when the observed range was 479-774MB. That set the budget 3.4% above the
then-largest image. **This is the second raise**, and the reason a second raise was needed so soon is
that the first one left almost no headroom.

## Decision record

The remediation fork "raise the budget vs. slim the orchestrator image" was put to the human and
answered **raise the budget**. The tradeoff is stated in full under _Assumptions and tradeoffs_ below.

## Chosen value: 1000MB

- **22.7% headroom** over the observed 815MB orchestrator image, versus the 3.4% that just failed.
- Still a real tripwire. The failure modes this assertion exists to catch are structural — shipping
  `devDependencies` into a runtime stage, leaking the `build` stage into a runtime stage, or losing
  the `--prod` flag on `Dockerfile:80`/`:147`. Each of those adds many hundreds of MB and would blow
  past 1000MB just as loudly as past 800MB. Nothing that 800 caught is let through by 1000.
- Absorbs the increment from the companion container-startup fix, which restores a native module
  binding to the runtime image.
- 1GB is a round, memorable ceiling, which matters for a constant that is read far more often than
  it is changed.

## Observable Truths (Acceptance Criteria)

1. `MAX_IMAGE_SIZE_MB` is `1000`.
   **Gate:** `grep -c '^MAX_IMAGE_SIZE_MB=1000$' scripts/docker-smoke-test.sh` -> `1`.
2. The constant carries a comment naming the observed sizes the budget was set against, so the next
   person to hit this does not have to reconstruct the history from `git log`.
   **Gate:** the lines above `MAX_IMAGE_SIZE_MB` cite run `33965602127` and the 815MB observation.
3. No assertion is weakened or removed. The size check still runs against all four images.
   **Gate:** `git diff` touches exactly one assignment line plus comments; `check_image_size` is
   called four times, unchanged.
4. `pnpm format:check` is clean and a changeset is present.

## Tasks

1. Raise `MAX_IMAGE_SIZE_MB` from `800` to `1000` and add the explanatory comment block.
2. Add a `patch` changeset.
3. Write the plan and session-state artifacts (this file and its sibling under `sessions/`).

## Assumptions and tradeoffs

- **Stated reservation, overruled by decision.** Raising the budget does not make the images smaller.
  A 815MB orchestrator image is large for what it contains, and the underlying cause — the `cli`
  stage installing the full production dependency closure of every workspace package it copies — is
  real and worth addressing. The human's call was that this red is a CI-signal problem and that image
  slimming is separate, elective work that should not be smuggled into a CI remediation. That call
  stands and is recorded here rather than re-argued.
- **Assumption:** the 815MB figure from run `33965602127` is representative. It is a `linux/amd64`
  image built by `docker/build-push-action@v6` from this exact `Dockerfile`; the image the smoke test
  measures is pulled from ghcr, not rebuilt, so the number is the shipped artifact's real size.
- **Deferred:** actual image-size reduction for the `cli`/`orchestrator` stages. Not filed by this
  plan; the budget comment points at it so the next raise has to confront it.
- **Deferred:** the smoke test discards stderr (`2>/dev/null`) on its runtime assertions, which is
  why the companion failures reported `''`. Being filed separately.
