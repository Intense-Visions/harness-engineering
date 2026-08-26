---
slug: "unattended-work-decomposition"
milestone: "Planning & Process"
order: 104
---

### Trustworthy spec-to-task decomposition without a human picking

- **Status:** planned
- **Spec:** —
- **Summary:** Fleets consume a queue of independent, well-scoped items. Today a human produces that queue — `roadmap-pilot` selects, `harness-planner` breaks a spec into tasks, and a person confirms both. That is affordable while an operator dispatches a few fleet runs a day. It is the binding constraint at any operating point where the queue must be refilled faster than a person can groom it: measured on one dogfood consumer, issues were created faster than they were closed (587 against 464 over 90 days), but a newly onboarded repository starts with no ranked queue at all and the fleets idle. Build: decomposition that can run unattended with a confidence signal — spec or issue in, independently-verifiable tasks out, each with acceptance criteria and a declared blast radius — plus a quality gate that parks low-confidence decompositions for human attention rather than dispatching them. The measure of success is queue depth sustained without a human in the loop, not decomposition speed.
- **Blockers:** Depends on `unattended-safe-contract-per-fleet-member`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1536
