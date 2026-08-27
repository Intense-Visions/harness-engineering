---
slug: "newsvendor-capacity-provisioning"
milestone: "Fleet Family — Batch Orchestration"
order: 149
---

### Newsvendor provisioning — critical-fractile sizing for advance capacity commitments

- **Status:** planned
- **Spec:** —
- **Summary:** Inventory theory's newsvendor model solves one-shot provisioning under demand uncertainty exactly: given a demand distribution, an overage cost (provisioned but unused) and an underage cost (demand unmet), the optimal commitment is the critical fractile — provision to the demand quantile equal to underage/(underage+overage) — not the mean, not the max, and never a round number chosen in a meeting. The pipeline makes newsvendor decisions constantly without the arithmetic: reserving compute/quota windows for overnight fleets, pre-warming worktrees and caches, sizing standing verifier pools, pre-purchasing rate-limit headroom — each committed before demand is known, each with asymmetric regret (an idle reservation costs its price; an exhausted one stalls the constraint and, per drum-buffer-rope, that hour is lost forever). Implement the calculator where these commitments are made: demand distributions from the same telemetry reference-class forecasting builds on, explicit overage/underage cost declarations per commitment class (underage at the constraint priced by lost drum-hours), the critical-fractile computation replacing convention, and realized-demand feedback sharpening the distributions. The signature output is legible asymmetry: when stockout at the bottleneck is 10× the cost of idle reserve, the right answer is provisioning at the 91st percentile, and the calculator says so with the arithmetic shown.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1679
