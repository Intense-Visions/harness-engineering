---
slug: "unified-work-admission-control"
milestone: "Fleet Family — Batch Orchestration"
order: 116
---

### One arbiter over authored and received work

- **Status:** planned
- **Spec:** —
- **Summary:** The two governors on this roadmap contend for the same resources and cannot see each other. `team-level-capacity-governor` allocates token spend, concurrent lanes and per-surface change rate to internal production; `inbound-contribution-triage-at-scale` allocates maintainer attention and review queue depth to external contributions. **Both claim review queue depth and lane capacity.** A project doing both at scale — internal fleets generating change while thousands of forks submit it — will have producer-side dispatch starve adjudication of external work, or the reverse, with no policy expressing which should win. Build a single admission controller over one shared capacity ledger: a declared allocation between authored and received work (an explicit fraction of review attention, compute and merge slots, not an emergent one), backpressure that throttles internal dispatch when the inbound queue ages past threshold, and one ranked queue in which a user-reported defect and a roadmap item are comparable rather than living in separate systems. The allocation is a stated organisational decision; the controller's job is to enforce it and report when it is being violated.
- **Blockers:** Depends on `team-level-capacity-governor` and `inbound-contribution-triage-at-scale`
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1548
