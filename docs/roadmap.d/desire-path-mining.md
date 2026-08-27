---
slug: "desire-path-mining"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 149
---

### Desire-path mining — systematic bypass patterns as design signals

- **Status:** planned
- **Spec:** —
- **Summary:** Urban planners read the dirt paths worn across lawns as design information: the paved path is wrong, and the desire path is the requirement. Process telemetry contains the same signal and nobody mines it: gates that are systematically overridden, fields always filled with boilerplate, steps always skipped via the same workaround, flags that every invocation sets, sequences users always reorder. Each is a vote against the designed path by someone who had a job to do. Build the miner: detect recurring bypass patterns in telemetry (override clusters, boilerplate detection on required inputs, flag-usage distributions, workaround sequences), rank by frequency × effort-expended-to-bypass, and emit them as design findings — candidate process changes — rather than compliance violations. The framing inversion is the feature: the same data that a compliance lens reads as 'users misbehaving' is, read correctly, the cheapest requirements-gathering instrument the project has. A bypass that survives investigation becomes a roadmap item to pave it; one that reveals genuine risk becomes a targeted enforcement fix with the evidence attached.
- **Blockers:** Depends on `operator-proficiency-against-automation-complacency`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1641
