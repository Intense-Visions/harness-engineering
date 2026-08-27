---
slug: "smed-changeover-reduction"
milestone: "Parallel Execution & State"
order: 141
---

### SMED changeover reduction — externalizing agent setup time

- **Status:** planned
- **Spec:** —
- **Summary:** Lean manufacturing's SMED (single-minute exchange of die) cut changeover times from hours to minutes with one analytical move: classify every setup step as internal (machine must be stopped) or external (can be done while the previous job still runs), then relentlessly convert internal to external and streamline what remains. Agent task changeover has the same anatomy and no such discipline: between tasks, an agent context is 'stopped' while it loads repo state, reads context, warms caches, re-derives orientation — all booked as task time but actually changeover, and much of it externalizable: the next task is usually known (the queue is visible), so its context assembly, artifact prefetch, baseline checkout, and even briefback drafting can run during the current task's execution — external setup by construction. Import the method: instrument changeover time per task transition (first-token-of-productive-work minus task start), classify the setup steps internal vs. external, build the prefetch pipeline that performs external setup concurrently with the running task (speculative where the queue is probabilistic, and reusing the speculative-execution machinery's isolation), and streamline the irreducibly-internal remainder. The measured target is the manufacturing one: changeover time driven toward single-digit percent of task time, which at fleet scale compounds into whole extra agents' worth of throughput from the same spend.
- **Blockers:** Depends on `progressive-context-encoding`, `speculative-pipeline-execution`, and `stability-ordered-context-layout`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1671
