---
number: 0094
title: Gate-option validity contract and CONFIRM consistency for the -fleet family
date: 2026-08-18
status: proposed
tier: medium
source: 'design routing of bug-backlog issues #1307, #1320, #1316'
---

## Context

The `-fleet` family's whole interaction economy rests on one up-front CONFIRM round: known forks
are front-loaded with recommended defaults, the batch runs autonomously thereafter, and only a
genuinely-unforeseen fork parks an item (ADR 0088). `fleet-command` extends this by presenting each
ready member's own CONFIRM **verbatim and never answering it** (ADR 0091). Because CONFIRM is
**once-only and carries recommended defaults**, the human's decision is only ever as good as the
menu presented — and nothing today validates that menu. Three routed bug-backlog issues share one
shape: **options reach the human without being checked for executability, for mutual consistency
across the batched forks, or for relevance to the gate they claim to gate.**

- **#1307 — options presented without an executability or consistency check.** In a `cicd-fleet`
  run the human accepted fork C option 1, "a `workflow_dispatch` smoke run of Docker" as accepted
  evidence. At DISPATCH the option was doubly invalid: (a) it **cannot discriminate the defect** —
  the bug only manifests under `workflow_call`, so a `workflow_dispatch` run proves nothing about
  broken-vs-fixed; and (b) it would have **published real images** (`push: true`, tagging `latest`)
  — exactly the backfill the human had **declined** in fork D of the same round. Two chosen options
  were mutually inconsistent, and neither the authoring member nor the conductor caught it;
  park-unforeseen caught it as a safety net, which is a failure of the menu, not a success of the
  gate.
- **#1320 — a trust fork firing on a signal unrelated to trust.** `cicd-fleet`'s CI-trust fork
  (ADR 0091's wave-0 trust gate) fires on **any non-empty CI queue**. Observed: the single red was
  a release-permissions failure while all-OS `build-and-test` was fully green — yet the fork
  recommended deferring the whole run behind an irrelevant CI repair. Because the fork carries a
  recommended default and CONFIRM is once-only, it **spent a human decision slot on a signal that
  does not bear on whether test results are trustworthy.**
- **#1316 — two scheduling rules that conflict at queue depth ≤1 with no tiebreak.**
  `fleet-command` states "the lander is never shed"; `pr-fleet`'s own "When to Use" says it is
  "NOT for a single PR." A run with exactly one open PR can satisfy one rule only by violating the
  other, and nothing declares which wins — so the conductor and the member disagree with no
  arbiter. Worse, `pr-fleet` SELECT does not read land-readiness, so an **unlandable** single-PR
  queue only surfaces at the terminal LAND wave rather than at CONFIRM.

The common defect is that CONFIRM's authority (ADR 0088/0089) is assumed to make the human's answer
authoritative, but an answer to an invalid, inconsistent, or irrelevant question is not. The menu
needs its own contract.

## Decision

The family adopts a **gate-option validity contract**: an option is not presentable at CONFIRM
until it has been checked for executability, cross-fork consistency, and gate-signal relevance.
Responsibility splits by who can see what.

1. **Members validate their own options for executability and discrimination before presenting.**
   A gate option that proposes evidence which **cannot discriminate broken-from-fixed for the defect
   it gates is invalid** and must not be offered (resolves #1307a). A member authoring an
   evidence-selection fork checks that the proposed evidence exercises the failing path — a
   `workflow_call`-only defect cannot be gated on a `workflow_dispatch` run — and drops or rewrites
   the option, recording why in the fork's rationale.

2. **The conductor runs a cross-fork consistency check when batching.** Before a batched CONFIRM
   round, `fleet-command` checks the chosen/recommended options across the forks in that round for
   **mutual contradiction** — an option that would perform an action another fork in the same round
   declines (publishing images in C after declining the backfill in D) is flagged at CONFIRM, not
   discovered at DISPATCH (resolves #1307b). This is a new obligation of the conductor tier because
   the contradiction spans forks **no single member can see** — the same reasoning that put
   cross-fleet dedup at this tier (ADR 0091 property 3).

3. **Trust forks are scoped to the checks the downstream stage actually consumes.** A CI-trust fork
   reads trust **only over the checks VERIFY depends on** (per-OS `build`/`test` plus `enforce` and
   `harness`); reds **outside** that set are reported as findings, not raised as a trust gate
   (resolves #1320). At minimum — where the dependency set cannot be resolved — the fork is
   **labelled with which checks are red and whether they intersect the downstream dependency set**,
   so a human never spends a decision slot without knowing the red is irrelevant. This narrows,
   never removes, ADR 0091's wave-0 trust gate.

4. **The `pr-fleet` depth-1 tiebreak is stated explicitly, and land-readiness surfaces at CONFIRM.**
   When `pr-fleet` is invoked **by the conductor**, "the lander is never shed" **wins**; the
   member's "not for a single PR" guidance is **advisory** in that context (resolves #1316). And
   `pr-fleet` SELECT reads `mergeStateStatus` / `reviewDecision` so an **unlandable** queue —
   including a lone unmergeable PR — is surfaced at CONFIRM as a flagged item, not discovered at the
   terminal LAND wave.

The contract does not touch who decides — CONFIRM authority stays with the human (ADR 0088/0089)
and gates stay unanswered by the conductor (ADR 0091). It constrains only what may be **put on the
menu**.

## Consequences

- **Positive:** the human's once-only CONFIRM decision is spent on valid, consistent, relevant
  options; an un-discriminating or self-contradictory option is caught at authoring/batching time
  rather than at DISPATCH by the park safety net; trust forks stop costing decision slots on
  irrelevant reds; an unlandable single-PR queue is visible up front; the conductor/member
  scheduling disagreement has a declared arbiter.
- **Negative / tradeoffs:** discrimination and dependency-set checks are **heuristic** — a member
  may misjudge whether evidence exercises the failing path, so the check tightens the menu but does
  not replace the park path as the backstop for what it misses. The conductor's cross-fork check
  adds a batching step and must know each fork's declared effects to detect contradictions, so forks
  now carry a machine-readable "effects" note. `pr-fleet` SELECT costs extra GitHub reads
  (`mergeStateStatus` is a GraphQL field) to surface land-readiness early.
- **Reversibility:** high — the contract is validation policy expressed in skill prose and a small
  per-fork effects annotation. Loosening a check, moving the tiebreak, or widening a trust fork's
  scope is a prose change, not an architecture change, recorded by superseding this ADR.
- **Degradation by design:** each check is a no-op when its class is absent — a fork with no
  discrimination claim, a round with one fork, a CI queue with no reds outside the dependency set,
  a multi-PR queue — so the contract adds nothing where nothing is at risk.

## Alternatives Considered

- **Rely on park-unforeseen to catch bad options mid-flight.** Rejected — this is exactly what
  happened in #1307, and it is a failure, not a success: park is the backstop for the genuinely
  unforeseen, not a substitute for validating a menu the fleet authored itself. Catching a
  contradiction at DISPATCH has already spent the human's CONFIRM decision on it.
- **Have the conductor answer or auto-correct an invalid member option.** Rejected — it violates
  ADR 0091's "gates batched, never answered." The conductor may **flag** an invalid or contradictory
  option and withhold it from the round; it may not silently rewrite the human's choice.
- **Drop the CI-trust fork entirely and always run.** Rejected — over-corrects #1320. A red inside
  VERIFY's dependency set is a real trust problem; the fix is to scope the fork to that set, not to
  remove the wave-0 trust gate ADR 0091 established.
- **Let `pr-fleet`'s "not for a single PR" guidance win and shed the lander at depth 1.** Rejected —
  it contradicts the conductor's "lander is never shed" and would strand a verified, authorized
  single PR at the terminal wave. The member guidance is a standalone-invocation heuristic; under
  the conductor the terminal-lander rule is authoritative.

## References

- Issues: #1307 (option executability/consistency), #1320 (trust-fork signal relevance), #1316
  (`pr-fleet` depth-1 tiebreak + land-readiness at SELECT).
- Companion: [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md) — the CONFIRM/park model whose menu this contract validates.
- Companion: [`0089-pr-fleet-land-stage-human-merge-gate.md`](0089-pr-fleet-land-stage-human-merge-gate.md) — the land gate whose SELECT now reads land-readiness.
- Companion: [`0091-fleet-command-conductor-tier-authority-model.md`](0091-fleet-command-conductor-tier-authority-model.md) — the conductor tier that runs the cross-fork consistency check and owns the scheduling tiebreak.
- Family overview: `docs/reference/fleet-family.md` (the `-fleet` spine, its invariants, and the conductor tier).
