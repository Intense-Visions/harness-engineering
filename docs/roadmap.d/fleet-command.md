---
slug: "fleet-command"
milestone: "Fleet Family — Batch Orchestration"
order: 15
---

### fleet-command — the conductor coordinating the `-fleet` family across the SDLC

- **Status:** planned
- **Spec:** docs/changes/fleet-command/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the capstone, one tier above the members and deliberately not named `-fleet`: it coordinates the fleets themselves rather than fanning out over an item-queue. Plans a run as a hybrid dependency DAG (a cicd-fleet CI prerequisite, the conveyor spine sequential, the quality sweeps parallel, pr-fleet terminal), enforces one **global** concurrency budget across every fleet in flight instead of additive per-fleet governors, owns cross-fleet deconfliction (merge-order planning, regeneration sequencing, lane serialization, cross-fleet filing dedup), batches the members' human gates by wave without ever answering them, verifies each lane from its emitted artifacts rather than re-running it, and emits one consolidated report. Never auto-merges.
- **Blockers:** —
- **Plan:** docs/changes/fleet-command/plans/2026-08-08-fleet-command-plan.md
- **Assignee:** Chad Warner
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1226
