---
slug: "verification-by-construction"
milestone: "v5.0 — Enforcement Hardening"
order: 103
---

### Verification whose cost does not scale with change rate

- **Status:** planned
- **Spec:** —
- **Summary:** Measured on a dogfood consumer, the merge gate runs a median of **21.4 minutes**. At an operator's current rate that is tolerable; at double it, the same gate implies well over a dozen gate-hours of compute per person per day. Parallelism hides the latency but not the cost, and the cost is paid per change — so test-suite execution as the primary correctness mechanism becomes the binding constraint on throughput long before authoring does. Build the complement: correctness established by construction rather than by running everything. Stronger types and exhaustiveness at boundaries, contracts and invariants on the paths that matter, property-based and specification-derived tests replacing hand-enumerated cases, and a tiered gate where the cheap conformance layer runs on every change and full execution runs once per merge train. The goal is a verification cost curve that flattens as change volume rises, instead of tracking it linearly.
- **Blockers:** Pairs with `policy-level-human-control` — the policy surface is what the conformance layer checks against
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1535
