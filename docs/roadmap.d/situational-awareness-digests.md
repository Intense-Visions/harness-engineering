---
slug: "situational-awareness-digests"
milestone: "Dashboard & Visualization"
order: 132
---

### Keep humans able to model the system at machine change rates

- **Status:** planned
- **Spec:** —
- **Summary:** Ashby's law, applied honestly: a controller must carry as much variety as the system it controls. Humans steering by policy (`policy-level-human-control`) can only steer what they can still mentally model, and at hundreds of changes a week no per-change surface — not even a good pre-merge brief — maintains that model; it degrades one PR at a time until the human is signing attestations about a system they no longer understand. That degradation is silent, and it is the failure mode automation research has documented for forty years. Build the counter-instrument: periodic system-level narratives generated from the intent and provenance layers — what changed *architecturally* this week, which invariants were touched, where entropy and churn concentrated, what the fleets decided autonomously and why, what diverged from the operator's stated expectations — at the abstraction level a human actually reasons at, with drill-down to evidence. Add the measurement that makes it honest: track comprehension debt explicitly (surfaces no human has attested understanding of within N weeks) the way coverage tracks untested code. The per-PR accountability brief answers "should this merge"; this answers "do I still understand the thing I am responsible for."
- **Blockers:** Depends on `intent-as-the-unit-of-record`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1564
