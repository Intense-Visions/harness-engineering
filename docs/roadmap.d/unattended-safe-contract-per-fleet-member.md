---
slug: "unattended-safe-contract-per-fleet-member"
milestone: "Fleet Family — Batch Orchestration"
order: 101
---

### Declare an unattended-safe contract per fleet member

- **Status:** planned
- **Spec:** —
- **Summary:** `fleet-command` already distinguishes a member's **gate-free path** — it probes each installed fleet's queue depth "through its own gate-free report-only path rather than reimplementing its selection, and never through a gated dry-run path." That concept exists for *probing* only. Dispatch then runs the real member skill, and every member's SELECT→CONFIRM→DISPATCH→VERIFY→REPORT loop includes a human CONFIRM, so a scheduled fleet still serialises on a person regardless of budget or quota. Any unattended-operation plan is therefore incoherent until each member declares which of its stages are safe to run without a human, and what the fallback is when an unattended run reaches a gate. Build: a per-member contract naming its gate-free stages, its mandatory-human stages, and a defined park-and-report behaviour at the boundary — so a scheduled run either completes or parks cleanly with a queued decision, never blocks holding resources. Prerequisite for `budget-governor-for-unattended-dispatch`, which assumes unattended dispatch is possible.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1533
