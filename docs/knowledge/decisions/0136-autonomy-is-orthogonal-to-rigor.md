---
number: 0136
title: 'Autonomy is orthogonal to rigor: --fast no longer auto-approves'
date: 2026-11-13
status: accepted
tier: large
source: docs/changes/trusted-autonomy-mode/proposal.md
---

## Context

> **Record of an operative decision.** This ADR documents spec decision **D2** of
> `docs/changes/trusted-autonomy-mode/proposal.md`, together with the Phase 3 class-map
> decisions **D-D**, **D-E** and **D-H** that applied it to autopilot
> (`docs/changes/trusted-autonomy-mode/plans/2026-11-13-trusted-autonomy-phase-3-plan.md`,
> "Decisions requiring sign-off"). Every claim below was checked against the skill text as it
> shipped.

Before this feature, autopilot's `rigorLevel` carried two unrelated meanings. `--fast` meant
**less verification** (no skeleton pass, `harness validate`-only VERIFY, WIRE-only INTEGRATE)
and **fewer pauses** (the Rigor Levels table read "Auto-approve, skip signals" for APPROVE_PLAN
and "WIRE only, auto-approve" for INTEGRATE, and the APPROVE_PLAN step recorded
`"auto_approved_plan_fast"`). The spec cites the coupling at
`agents/skills/claude-code/harness-autopilot/SKILL.md:104-114` and `:174` as of the spec date.
The user asked for the second meaning only: stop being asked to approve ceremony, without giving
up any checking. With the two coupled, the only way to get fewer approvals was to accept less
verification, and the only way to get full verification was to approve every plan by hand.

## Decision

Autonomy (`supervised` | `trusted`) and rigor (`fast` | `standard` | `thorough`) are separate
axes. **Autonomy decides who decides at a pause; rigor decides how much is checked.** Neither
setting changes the other.

- **D-D, fast APPROVE_PLAN.** `fast` uses the same plan-approval signals as `standard`. When a
  signal fires, the approval is a `ceremony` pause, so autonomy decides whether it auto-resolves.
  Shipped at `agents/skills/claude-code/harness-autopilot/SKILL.md:117` ("Rigor decides how much
  is checked; autonomy decides who approves ... `--fast` never approves a plan or INTEGRATE on its
  own.") and `:199` (`"fast"` → same signals as `"standard"`).
- **D-E, thorough forced review.** `thorough` still forces the plan-approval and ADR-review
  pauses (that is rigor: more is checked), but who approves them is autonomy: they are forced
  `ceremony` pauses. The Rigor Levels table reads "Review forced (every plan)" and "Full + every
  ADR draft reviewed" (`SKILL.md:112`, `:115`).
- **D-H, `--review-plans`.** With `reviewPlans: true`, plan approval never auto-resolves, at any
  autonomy level (`SKILL.md:211`). The human typed the flag, and a flag may only lower autonomy
  (spec D17).

The pause classes and the rules for resolving them live in one place,
`agents/skills/templates/pause-protocol.md`; autopilot points at it rather than restating them.

## Consequences

- **A deliberate behaviour change for supervised `--fast` users (SC10).** A user running
  `--fast` in `supervised` mode (the default) now gets a plan-approval pause whenever a signal
  fires, and an INTEGRATE pause, where before both were auto-approved. SC10 states this as the
  only intended behaviour change for supervised users. The supported way to skip those pauses is
  trusted mode, not a lower rigor level.
- **Rigor semantics are unchanged.** What `fast`, `standard` and `thorough` check is exactly what
  they checked before; only the approval step moved to the autonomy axis (spec non-goal "Changing
  what `rigorLevel` checks").
- **Trusted mode does not reduce checking.** A trusted `thorough` run checks everything a
  supervised `thorough` run checks; it only stops asking a human to approve ceremony. Gates (red
  verify, `NOT_SATISFIED`, blocking findings) still stop at every level (ADR 0138, spec D1).
- **One more place a reader must look.** Understanding why a run paused now needs both settings.
  `harness autonomy show` reports the resolved autonomy and its source; the rigor level is in the
  autopilot session state.

## References

- Spec: `docs/changes/trusted-autonomy-mode/proposal.md` (D1, D2, D17; SC10).
- Phase 3 plan: `docs/changes/trusted-autonomy-mode/plans/2026-11-13-trusted-autonomy-phase-3-plan.md`
  (decisions D-D, D-E, D-H).
- Protocol: `agents/skills/templates/pause-protocol.md` ("Pause classes", "Resolving a pause
  point").
- Skill: `agents/skills/claude-code/harness-autopilot/SKILL.md` (Rigor Levels table, APPROVE_PLAN).
- Related: [ADR 0137](./0137-autonomy-trust-boundary-is-user-level-and-raise-only-by-the-human.md)
  (who may raise autonomy), [ADR 0138](./0138-blind-then-refute-self-audit-for-auto-resolved-judgment-forks.md)
  (the self-audit that guards auto-resolved judgment forks).
- Guide: `docs/guides/trusted-autonomy.md`.
