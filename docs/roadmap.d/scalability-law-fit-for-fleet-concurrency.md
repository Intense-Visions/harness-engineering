---
slug: "scalability-law-fit-for-fleet-concurrency"
milestone: "Parallel Execution & State"
order: 120
---

### Fit a scalability law to fleet concurrency instead of guessing a cap

- **Status:** planned
- **Spec:** —
- **Summary:** Fleet width is set by a static heuristic — slots derived from CPU count, a global pool shared across lanes. But parallel systems do not scale linearly: throughput follows the Universal Scalability Law, where contention (queueing on shared resources: merge serialisation, rate-limited APIs, the shared review stage) and coherency (cost of keeping workers consistent: rebases, conflict resolution, lease negotiation) first flatten and then *reverse* the throughput curve. Somewhere there is a width at which adding a lane reduces total output, and today nobody knows where it is. Build: instrument per-lane throughput at varying widths, fit the two USL coefficients per repository from observed data, and set dispatch width from the fitted optimum rather than from CPU count — re-fitting as the repo, gates and team change. The coherency coefficient is the diagnostic gold: a rising β says the constraint is rebase/conflict cost, which no amount of added width fixes and which points investment at `concurrent-change-coordination-at-scale` instead.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1552
