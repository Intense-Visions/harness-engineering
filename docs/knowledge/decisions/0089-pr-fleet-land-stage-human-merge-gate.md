---
number: 0089
title: The pr-fleet land-stage human-merge-gate model
date: 2026-08-08
status: accepted
tier: large
source: docs/changes/pr-fleet/proposal.md
---

## Context

`pr-fleet` is the terminal **land** stage of the `-fleet` family conveyor (intake → decide →
build → land). Unlike its structural twin `roadmap-fleet` — which produces merge-ready PRs and
**never merges** — `pr-fleet` is the stage that actually lands PRs. That raises a question no
earlier stage faces: **who holds the merge decision, and where in the pipeline does it sit?**

The family's non-negotiable invariant is that no member silently merges or ships unreviewed work
(see the `-fleet` spine and ADR 0088). But "land the PRs" and "never silently auto-merge" are in
obvious tension: a land stage that never merges anything is just `roadmap-fleet` again, while a
land stage that merges on its own judgment violates the invariant. The design must let the fleet
**execute** merges while keeping the **decision** with a human, and it must place that human
decision somewhere that (a) preserves the family's single-up-front-touchpoint interaction model
and (b) does not let an unverified or unreviewed PR reach `git merge`.

Three failure modes bound the design. Merge on the fleet's own judgment — and unreviewed work
lands silently. Ask the human per-PR at merge time — and the fleet is no better than merging each
PR by hand, breaking the one-touchpoint model. Defer entirely to GitHub-native auto-merge-on-green
— and the "reviewed" bar collapses to "CI passed," landing work no human ever chose to land.

## Decision

`pr-fleet` adopts a **CONFIRM-authorized, verify-gated, fleet-executed** land model.

1. **The merge decision is a human act captured up front in CONFIRM.** In the single guaranteed
   human touchpoint, the human explicitly checks **which PRs to land**. That checked set is the
   merge authorization — the family's front-loaded interaction model (ADR 0088) extended to carry
   the merge decision, not just batch scope and fork answers.

2. **Independent verification stands between authorization and merge.** A PR is landed only after
   VERIFY independently confirms — never by subagent self-report — all-OS CI green (plus enforce
   and harness), a recorded review verdict, and mergeability (no conflicts, base current). A PR the
   human authorized but that verification does not clear is reported, not landed.

3. **The fleet executes the land; it never originates the decision.** LAND merges **exactly** the
   PRs that are both authorized (CONFIRM) and verified (VERIFY), via the repo's configured merge
   method, honoring branch protection. It merges nothing else. If branch protection blocks a merge
   (e.g. a required human review is still missing), the PR is reported not-landed with the reason —
   the fleet never routes around protection.

4. **Review-assist accelerates the verdict; it never fabricates it.** DISPATCH may run the real
   `harness-code-review` and push mechanical fixes, but it never posts a human approval and never
   resolves a semantic review finding by guessing. The review verdict VERIFY requires comes from
   the real pipeline, never from the fleet inventing one to clear the gate.

## Consequences

- **Positive:** the human's merge decision is exercised once, up front, over a triaged queue — the
  same one-touchpoint economics as the rest of the family; every land traces to an explicit human
  authorization **and** independent verification, so nothing unreviewed or unverified lands;
  branch protection remains authoritative; the fleet still delivers real throughput because
  execution (triage, assist, verify, merge) is autonomous.
- **Negative / tradeoffs:** the human must enumerate the land set up front rather than reacting
  per-PR, so a PR that only becomes land-ready mid-run (e.g. after assist) but was not pre-checked
  waits for the next round; this is deliberate — it keeps the merge decision a human act rather
  than letting "it went green" auto-authorize a merge.
- **Reversibility:** high — the gate's seat is interaction policy in skill prose. Moving it (e.g.
  to a post-verify second touchpoint, or opting a repo into GitHub-native auto-merge) is a prose
  change, not an architecture change, and would be recorded by superseding this ADR.

## Alternatives Considered

- **Fleet merges on its own judgment when CI is green and a review exists.** Rejected — violates
  the family's never-silently-merge invariant; "green + some review" is not a human choosing to
  land this PR now.
- **Ask the human per-PR at merge time (a touchpoint per land).** Rejected — breaks the
  single-up-front-touchpoint model; the human is back to babysitting each merge, which is the slog
  the fleet exists to remove.
- **Defer to GitHub-native auto-merge-on-green.** Rejected as the default — it collapses the
  "reviewed and chosen" bar to "CI passed," landing PRs no human selected. It remains a per-repo
  opt-in a future revision could layer on top of the CONFIRM authorization, not a replacement for it.
- **A second human touchpoint after VERIFY (confirm-then-verify-then-confirm-again).** Rejected for
  v1 — it doubles the human's involvement for marginal safety over the verify gate; parked as the
  most likely future evolution if practice shows the up-front set drifts from what ends up verified.

## References

- Source proposal: `docs/changes/pr-fleet/proposal.md`.
- Companion: [`0087-subagent-fanout-vs-workflow-primitive.md`](0087-subagent-fanout-vs-workflow-primitive.md) — the execution architecture the land stage runs on.
- Companion: [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md) — the interaction model the merge authorization extends.
- First instance: `agents/skills/claude-code/pr-fleet/SKILL.md` (CONFIRM merge authorization, VERIFY gate, LAND executor).
- Family overview: `docs/reference/fleet-family.md` (the `-fleet` spine and invariants).
