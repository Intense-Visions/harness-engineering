---
slug: "budget-governor-for-unattended-dispatch"
milestone: "Fleet Family — Batch Orchestration"
order: 93
---

### Budget governor for unattended dispatch

- **Status:** planned
- **Spec:** —
- **Summary:** Measured operator behaviour contradicts the assumption that fleets already run unattended: of 1,866 commits in 90 days, **24 landed at a weekend — 1.3%** — and the hour histogram peaks 10:00–16:00 and collapses after 18:00. All of the observed 57x-median throughput is produced inside a normal work week, ~50 hours of 168 available, because fleets are operator-dispatched rather than scheduled. Naive scheduling is unaffordable: that operator was already at ~78% of a weekly usage budget, so 168-hour operation needs ~3.4x the quota. Build the governor that makes unattended operation safe to enable — a spend envelope per period, dispatch that stops cleanly at the envelope rather than mid-lane, per-fleet allocation, and a visible remaining-budget signal. Resolves half the open design blocker on `lightweight-nightly-micro-loop-primitive` (#1405): the thin cron primitive is the *what*, this is the *how much*.
- **Blockers:** Depends on cost-per-merged-pr-attribution
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1525
