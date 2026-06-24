---
type: business_concept
domain: core
tags: [review, ci, required-review, degradation, secret-gating, anti-theatre]
---

# Tiered Review Degradation

`harness review-ci` runs in two tiers so the gate works for every adopter while
delivering the full multi-persona review when one opts in. It degrades gracefully
rather than failing when the LLM tier is unavailable.

## Tiers

1. **Heuristic floor (always on, client-agnostic, no secret).** Reuses
   `runReviewPipeline` — mechanical checks + rule-based agents. Always runs and can
   block. A mechanical-stop short-circuits the LLM tier (no point spending tokens on
   a diff that already fails).
2. **LLM multi-persona tier (secret-gated).** Runs only when a `--runner` is given
   AND its secret is present (`!env[secretEnvVar]`, so an unset/empty secret counts
   as absent). Otherwise the command logs `LLM tier skipped — secret … not set
(floor-only)` and proceeds on the floor. The `local` runner needs no secret
   (endpoint + model env), giving an LLM-judgment review at zero token cost.

## Skip vs fail — the load-bearing distinction

Graceful **skips** (missing secret, unsupported runner, unconfigured endpoint, no
runner) never set the failure flag and never block on their own. A runner that was
explicitly requested and then **fails to execute** (spawn error, timeout, oversized
output, parser throw) sets `requiredRunnerFailed`, which blocks **even under
`--block-on none`**. A hung or broken required runner can never present as a green
check — the anti-theatre invariant.

## Threshold

`--block-on` (default `request-changes`) sets the merge gate: fail when
`assessment >= block-on`, OR when a required runner failed. `none` disables the
assessment gate but still blocks on required-runner failure.

See also: [[ci-review-contract]], [[code-review-pipeline]], [[required-check-binding]].
Decision: ADR 0041.
