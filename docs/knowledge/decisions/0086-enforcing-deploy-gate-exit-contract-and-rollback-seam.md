---
number: 0086
title: Enforcing deploy gate — four-value exit-code contract and rollback path-verification seam
date: 2026-08-07
status: accepted
tier: large
source: docs/changes/enforcing-deploy-gate/proposal.md
---

## Context

The harness lifecycle stops _enforcing_ the moment code ships. `harness-deployment`
was a Tier-3 `advisory-guide` — a prose walkthrough (DETECT → ANALYZE → DESIGN →
VALIDATE) that produced recommendations but carried no exit-code authority: its
`## Gates` section _named_ the hard rules ("No production deploy without staging
validation", "No long-lived credentials in pipelines", "No deploy without rollback")
yet nothing mechanically enforced them.

Turning those named gates into a real enforcing gate (`harness check-deployment`, a
pure core engine + a `check-*` CLI command, mirroring `check-arch` / `check-deps`)
surfaces two durable cross-skill contracts that must be pinned _before_ the gate
ships, because future work will depend on both:

1. **How the gate reports outcomes** — pass, block, error, and the delicate
   "examined nothing" case must be distinguishable and never collapse into a false
   green.
2. **How the gate connects to `harness-rollback`** — the pre-ship readiness check and
   the post-ship circuit breaker form a pair, and the shape of that connection
   (verification vs. invocation) determines whether it adds new coupling.

This ADR records both. It implements Half (A) of GitHub #712 ("Extend enforcement
past ship"); the operations half (live production-signal ingestion) is deferred by
owner decision and is out of scope here.

## Decision

### D2 — Four-value exit-code contract, reusing the existing `ExitCode` enum

`harness check-deployment` reports exactly four outcomes, reusing the enum in
`packages/cli/src/utils/errors.ts` rather than inventing a bespoke scheme:

| Exit | `ExitCode`          | Meaning                                                                              |
| ---- | ------------------- | ------------------------------------------------------------------------------------ |
| `0`  | `SUCCESS`           | Deployment config detected, no hard violations — or the gate is explicitly disabled. |
| `1`  | `VALIDATION_FAILED` | At least one hard violation → blocked.                                               |
| `2`  | `ERROR`             | Internal failure or misconfiguration (unreadable/malformed `harness.config.json`).   |
| `3`  | `ZERO_DENOMINATOR`  | No deployment configuration detected → **abstained loudly**.                         |

`ExitCode.ZERO_DENOMINATOR` already exists precisely for the case where "the gate
examined NOTHING — abstained, not passed, must never read as green." Reusing it makes
the deploy gate's graceful-degradation behavior doctrine-aligned rather than
one-off: a repo that does not deploy is neither a pass (`0`) nor a hard fail (`1`);
it is an explicit abstention that a human must interpret. `deployment.enabled: false`
is distinct — it short-circuits to `0 SUCCESS` with an opt-out note, because the
operator has made an explicit, reviewable choice rather than the gate finding
nothing to examine.

The pure core `deriveExitCode(result)` maps the engine's `status`
(`pass` / `blocked` / `abstained` / `disabled`) to the numeric literal; the CLI owns
`process.exit` and the `2 ERROR` path (config/IO failures the pure engine never
raises itself).

### D5 — Rollback wiring is a path-existence _verification_, not an invocation

The gate's `DEPLOY-RB001` rule verifies that a rollback _path exists_ — it does not
run one. The requirement is satisfied by any of: a `rollback` block in
`harness.config.json` (the `harness-rollback` circuit breaker is wired), a
revert/rollback workflow or `deploy/rollback` script, or a documented rollback
runbook. The gate never deploys and never merges a revert.

On failure, the `DEPLOY-RB001` remediation points at `harness-rollback` and explains
the complementarity: **`check-deployment` = pre-ship readiness (can we roll back?);
`harness-rollback` = post-ship execution (open the revert PR when a signal or
evaluation fires, propose-only — a human merges).** The two skills form the
pre/post-ship pair the issue calls for, connected by a config seam (`rollback`) both
already read — so the seam is an existing config edge, not a new coupling surface.

## Consequences

**Positive:**

- The "abstained, not passed" semantics (`ZERO_DENOMINATOR`) are now reusable by any
  future gate that can examine an empty denominator, not special-cased to deployment.
- The deploy ↔ rollback relationship is expressed as a config edge (`rollback`) both
  skills already consume; no new coupling surface is introduced.
- CI integrators get a stable, documented four-value contract they can branch on
  (block on `1`, treat `3` as "needs a human", fail the pipeline on `2`).

**Negative:**

- Adopters must learn that exit `3` is **not** green. A pipeline that naively treats
  "non-1 = success" will mis-read an abstention as a pass; the contract and the skill
  body call this out explicitly, but it is a genuine onboarding cost.
- Verifying a rollback _path_ (not exercising a real rollback) means a wired-but-broken
  rollback still passes `DEPLOY-RB001`. This is an accepted limit: the gate proves the
  path exists; correctness of the path is the post-ship circuit breaker's concern.

**Neutral:**

- `DEPLOY-SEC001` remains non-waivable while `DEPLOY-RB001` / `DEPLOY-ENV001` are
  severity-overridable; that block-set decision is captured in the spec and the skill
  body and does not need its own ADR.
- The gate ships standalone and opt-in (`deployment.enabled`), not folded into the
  default `ci check` orchestrator, so the new exit-code contract does not change any
  existing command's behavior on upgrade.

## Related

- Spec: `docs/changes/enforcing-deploy-gate/proposal.md` (decisions D2 and D5)
- Core engine: `packages/core/src/deployment/` (`detectDeploymentSurface`,
  `evaluateDeploymentGate`, `deriveExitCode`)
- CLI command: `harness check-deployment` (`packages/cli/src/commands/check-deployment.ts`)
- Exit-code enum + abstention doctrine: `packages/cli/src/utils/errors.ts`
- Post-ship circuit breaker: `harness-rollback` skill and its `rollback` config seam
- Tracks GitHub #712 — "Extend enforcement past ship (deployment + operations)"
