---
slug: "stigmergic-fleet-coordination"
milestone: "Parallel Execution & State"
order: 132
---

### Stigmergic coordination — environment-mediated fleet coordination with evaporating markers

- **Status:** planned
- **Spec:** —
- **Summary:** Every fleet today coordinates through a central orchestrator, which is precisely the serial fraction the scalability-law work will measure and indict. Colonies solved coordination without a coordinator: individuals modify the environment (pheromone deposits) and read it back, evaporation provides automatic staleness, and thresholds turn local concentrations into collective behavior (quorum sensing). Build the analog: agents deposit typed, TTL-decaying markers on the code graph — 'verified 2h ago', 'under construction', 'failing here', 'convention drift observed', 'hot' — and other agents route by reading local marker gradients instead of asking the orchestrator. Quorum rules turn concentrations into collective transitions with no global census: N distinct failure markers in one region within a window triggers swarm-to-investigate; construction-marker density above threshold triggers avoidance or queueing; verification markers suppress redundant re-checking. The orchestrator remains for admission, budget, and human gates — stigmergy replaces the coordination chatter, not the governance. This is the only architectural path on the table where coordination capacity scales with the environment rather than with a coordinator, and evaporation gives it the property central state never has: stale information deletes itself.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1623
