---
slug: "model-check-the-orchestration-protocol"
milestone: "Parallel Execution & State"
order: 130
---

### Model-check the fleet lifecycle before running it unattended

- **Status:** planned
- **Spec:** —
- **Summary:** The orchestration layer is becoming a distributed protocol: lanes with worktree isolation, region leases (`concurrent-change-coordination-at-scale`), budget stops mid-run (`budget-governor-for-unattended-dispatch`), park-and-report at human gates (`unattended-safe-contract-per-fleet-member`), admission arbitration (`unified-work-admission-control`). Protocols of this shape fail in interleavings no test suite explores: a lane parked at a gate holding a lease while the budget governor halts the lane that would release it; two fleets deadlocked on each other's regions; work lost when a stop lands between VERIFY and REPORT. Testing samples interleavings; model checking enumerates them. Build: a formal model (TLA+ or equivalent) of the lifecycle state machine — lanes, leases, budgets, gates, queues — checked for deadlock-freedom, no-lost-work, and bounded-park invariants, kept in the repository and re-checked in CI when the protocol changes. The model is small; the property it buys is exactly the one unattended operation stakes everything on: the system either finishes or parks cleanly, in *every* interleaving, not just the ones a test happened to produce.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1562
