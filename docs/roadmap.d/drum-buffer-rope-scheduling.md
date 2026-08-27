---
slug: "drum-buffer-rope-scheduling"
milestone: "Fleet Family — Batch Orchestration"
order: 148
---

### Drum-buffer-rope — subordinating work release to the constraint

- **Status:** planned
- **Spec:** —
- **Summary:** Theory of Constraints scheduling rests on one observation with teeth: a system produces at the pace of its constraint, so releasing work faster than the constraint's pace creates only queues, and an hour lost at the constraint is an hour lost forever while an hour lost elsewhere is a mirage. Drum-buffer-rope operationalizes it — the drum is the constraint's schedule, the buffer is protective work-in-progress placed only in front of the constraint, and the rope ties upstream release to the drum's pace so nothing enters faster than the bottleneck can consume. The pipeline's constraint is usually known (review attention or verification compute) yet release is governed by demand at the front door: intents decompose and dispatch at arrival rate, queueing at the constraint as aging inventory. Implement the mechanism over instruments already filed: the queueing model and capacity governor identify the constraint and its pace (the drum); admission control's release rate ties to it (the rope); buffers concentrate before the constraint only, sized by buffer-management (penetration alarms — how deep into the protective buffer has consumption reached — as the operational signal); and everything non-constraint deliberately idles rather than producing queue. The cultural import is the hard part encoded as policy: utilization of non-constraints is explicitly not a goal, and the telemetry stops rewarding it.
- **Blockers:** Depends on `bullwhip-demand-signal-dampening`, `queueing-model-for-pipeline-capacity`, `team-level-capacity-governor`, and `unified-work-admission-control`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1676
