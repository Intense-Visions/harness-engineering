---
slug: "feedback-control-for-governors"
milestone: "Fleet Family — Batch Orchestration"
order: 135
---

### Governors need control theory, not thresholds

- **Status:** planned
- **Spec:** —
- **Summary:** Every governor on this roadmap — spend envelopes, admission control, backpressure from queue depth — is currently specified as a threshold: cross the line, throttle; fall below, resume. Threshold controllers oscillate, and coupled threshold controllers oscillate together: internal dispatch throttles on review-queue depth, the queue drains, dispatch resumes, the queue refills, in a limit cycle that wastes capacity at both extremes and thrashes every human watching the dashboard. Control theory solved this: setpoint tracking with proportional response (throttle *in proportion to* deviation, not all-or-nothing), damping against the known delay between actuation and effect (a lane dispatched now hits the review queue much later — delayed feedback is the classic oscillation driver), anti-windup on the integral term so a long saturation does not overshoot on recovery, and explicit oscillation detection that flags a governor fighting itself or another governor. Build it once as a shared controller primitive the governors instantiate, with `queueing-model-for-pipeline-capacity` supplying the plant model and setpoints. The queueing item says where the system should sit; this one is the actuator that holds it there without ringing.
- **Blockers:** Depends on `queueing-model-for-pipeline-capacity`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1567
