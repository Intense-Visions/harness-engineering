---
slug: "agent-apoptosis-and-lineage-hygiene"
milestone: "Parallel Execution & State"
order: 133
---

### Agent apoptosis and lineage hygiene — programmed death and the germline barrier

- **Status:** planned
- **Spec:** —
- **Summary:** Biology maintains multicellular integrity with two mechanisms this field lacks. First, apoptosis: a cell detecting internal damage self-destructs cleanly rather than persisting as a mutation risk — whereas every agent framework tries to *recover* a degraded agent, which is how plausible-but-wrong output ships. Give agents a self-termination contract: continuously self-check context-integrity signatures (contradiction density, instruction drift from the pinned intent, tool-result/claim divergence, poisoned-input markers), and on breach, die cleanly — checkpoint provenance, discard working state, respawn from the last verified checkpoint. Death is cheap; corrupted continuation is not. Second, the germline/soma barrier (Weismann): somatic mutations never reach offspring. Episodic working state — session context, scratch conclusions, unverified beliefs — must never inherit across agent generations; only compiled, verified knowledge crosses into a spawned agent's inheritance. Add a Hayflick limit: a hard replication-depth cap on agent-spawns-agent chains, after which lineage state must pass through a germline reset (re-derivation from verified knowledge only). Together these bound error accumulation in exactly the two channels it compounds through: within a long-lived agent, and across a lineage of them.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1605
