---
number: 0117
title: The CI-trust fork is scoped to VERIFY's actual dependency set, not any non-empty CI queue
date: 2026-08-31
status: proposed
tier: medium
source: 'decision-blocked issue #1320'
---

## Context

The `fleet-command` conductor opens each run with a **CI trust gate** (ADR 0091,
property "run order is derived — and wave 0 is a trust gate, not a repair"). The rule
as written is purely mechanical: **any non-empty `cicd-fleet` queue** implies the
conductor recommends running `cicd-fleet` alone this session and defers everything else,
surfaced at CONFIRM as a **fork with a recommended default** (run the CI member alone /
proceed with every downstream verdict labelled `degraded` / trim the fleets that lean
hardest on CI).

But the downstream thing that actually depends on CI trustworthiness is **VERIFY's
all-OS-green check** — the per-item verification every member performs before a result is
`verified` rather than `degraded`/`failed` (`docs/reference/fleet-family.md`, the
artifact + all-OS-CI discipline; ADR 0091 property 5, "verification reads the children's
artifacts"). A red that **cannot affect that check** should not gate the run.

The first `fleet-command` run (issue #1259) showed the mismatch concretely: the single
red in the CI queue was a **release-permissions** issue (protected-`main` / PR-create) —
all-OS `build-and-test` was fully green. VERIFY's dependency set was entirely healthy.
The mechanical rule nonetheless recommended deferring the **entire run** behind a CI
repair that had no bearing on whether any lane's verification could be trusted.

That cost is not free. Because the fork carries a recommended default and CONFIRM is a
**once-only** human round (ADR 0088, the front-load-park-unforeseen interaction model), a
mechanically-fired fork **spends a human decision slot** and can **defer a whole run** on
a signal that is irrelevant to trust. The trust gate exists to protect verification
integrity; firing it on reds outside verification's dependency set inverts its purpose —
it adds friction without adding safety.

## Decision

**Scope the CI-trust read to the signal VERIFY actually consumes: the per-OS
`build`/`test` checks and the `enforce`/`harness` gates. A red outside that dependency
set is reported as a finding (routed to `cicd-fleet`'s own queue), not raised as a
run-level trust fork.**

Concretely:

1. **Define VERIFY's dependency set explicitly.** It is the set of checks a member's
   VERIFY phase reads to reach a `verified` verdict: the per-target-OS `build-and-test`
   checks plus the project's required `enforce` / `harness` gates. This set is what "an
   untrustworthy CI signal" must be measured against — not the raw queue length.

2. **Intersect the CI queue's reds with that set.** If one or more reds **intersect**
   VERIFY's dependency set, fire the trust fork as today — verification genuinely cannot
   be trusted, and the human must choose (run CI alone / proceed degraded / trim). If the
   reds are **disjoint** from the set (release-permissions, publish/OIDC, docs-site
   deploy, and similar out-of-band checks), do **not** fire a run-level fork; record them
   as findings for `cicd-fleet` and proceed.

3. **Label the fork with the intersection when it does fire.** Even when firing, annotate
   the fork with **which checks are red** and **whether they intersect VERIFY's
   dependency set**, so the human answering the once-only round can see the difference
   between "your test signal is untrustworthy" and "an adjacent pipeline is red."

4. **Fail safe toward surfacing when the distinction is hard to draw mechanically.** If a
   given check cannot be classified in or out of the dependency set with confidence,
   treat it as **intersecting** and fire the labelled fork. Surfacing an ambiguous red to
   the human is the safe error; silently swallowing a possibly-trust-relevant red is not.

**Assumptions made (recommended-option defaults, per the fleet's park-vs-default model):**
the middle option from #1320 — keep firing but **label** — is adopted as the fallback for
ambiguous checks rather than attempting a perfect mechanical partition on day one; the
dependency set is defined as the per-OS build/test plus enforce/harness gates (not a
broader "all required checks") because that is exactly what VERIFY reads today.

## Consequences

- **Positive:** the once-only CONFIRM decision slot is no longer spent on reds that cannot
  affect any lane's verification, and a whole run is no longer deferred behind a CI repair
  irrelevant to trust. The trust gate reclaims its actual purpose — protecting
  verification integrity — and its false-positive rate drops to the reds that genuinely
  threaten a `verified` verdict.
- **Negative / tradeoffs:** the conductor must now know VERIFY's dependency set and
  classify each red check against it, which is more logic than counting a queue. A
  misclassification that files a **trust-relevant** red as a mere finding would let a
  degraded signal through unflagged — which is why the classification errs toward firing
  the labelled fork whenever a check cannot be confidently placed outside the set.
- **Reversibility:** high. The dependency set and the intersection rule are conductor
  scheduling policy expressed in prose plus the fork-labelling; widening or narrowing the
  set, or reverting to the mechanical "any non-empty queue" rule, is a prose-and-test
  change, not an architecture change.

## Alternatives Considered

- **Keep the mechanical "any non-empty `cicd-fleet` queue fires the fork" rule.** Rejected
  — it defers whole runs on reds (release-permissions, docs deploy) that provably cannot
  change any VERIFY verdict, spending the scarce once-only decision slot on noise.
- **Drop the CI trust fork entirely and always proceed `degraded`.** Rejected — a red that
  **does** intersect VERIFY's dependency set means the all-OS-green check itself is
  untrustworthy; suppressing the fork there would ship `verified` verdicts built on a
  signal that cannot be trusted. The gate must still fire on real intersections.
- **Fire the fork always but only ever label it (never suppress).** Rejected as the
  primary rule (kept only as the ambiguous-check fallback) — labelling helps the human but
  still burns a decision slot on every disjoint red; the point of the scoping is that a
  provably-disjoint red should not reach CONFIRM at all.

## References

- Refines: [`0091-fleet-command-conductor-tier-authority-model.md`](0091-fleet-command-conductor-tier-authority-model.md) — the CI trust gate (wave 0) and the degraded-verdict labelling this ADR scopes to VERIFY's dependency set.
- Companion: [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md) — the once-only CONFIRM round whose decision slot a mechanically-fired fork spends.
- Resolves: #1320 (the CI trust fork fires on any non-empty CI queue, a signal unrelated to whether test results are trustworthy).
- Related: #1294 (base-freshness) and #1295 (pr-fleet first-run report), which bear on what VERIFY and pr-fleet SELECT read.
- Family overview: `docs/reference/fleet-family.md` (the `-fleet` spine, the artifact + all-OS-CI verification discipline).
