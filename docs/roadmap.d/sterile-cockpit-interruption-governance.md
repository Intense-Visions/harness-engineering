---
slug: "sterile-cockpit-interruption-governance"
milestone: "Parallel Execution & State"
order: 140
---

### Sterile cockpit — interruption governance during critical phases

- **Status:** planned
- **Spec:** —
- **Summary:** Aviation's sterile cockpit rule is blunt and effective: below 10,000 feet — the phases where errors are least recoverable — no non-essential communication reaches the flight crew, by regulation, because interruption during critical operations is a documented killer and 'just one quick question' is how it arrives. Agent pipelines have critical phases with the same signature — landing sequences, release cuts, incident response, migration cutovers, threshold-authorized irreversible actions — and no interruption discipline: mid-phase, an agent or operator context can receive new intents, digest pings, comment notifications, and re-prioritization signals, each a context-switch exactly where state is least recoverable. Declare the sterile phases: operations classed as critical carry an interruption policy — non-essential signals are deferred and queued (not dropped), essential interrupts are a declared short list (abort signals, safety alarms), and the policy binds both agent contexts (the orchestrator withholds new work and messages) and human channels (digests batch, notifications hold) for the phase's bounded duration. The discipline is cheap because phases are short and defined; the payoff is concentrated exactly where errors cost the most — and the deferred-signal queue means nothing is lost, only sequenced.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1672
