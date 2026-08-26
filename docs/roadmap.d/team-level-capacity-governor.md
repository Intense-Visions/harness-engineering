---
slug: "team-level-capacity-governor"
milestone: "Fleet Family — Batch Orchestration"
order: 105
---

### Govern aggregate capacity across operators, not just per operator

- **Status:** planned
- **Spec:** —
- **Summary:** Every governor in the fleet family is scoped to one operator's run — slot budgets per workflow, a global leaf pool per invocation, and (proposed) a spend envelope per period. None of them see a second operator. The arithmetic that breaks first is aggregate: a ten-person team operating at the level a single operator already sustains would produce more merged changes than the entire 1,957-repository organisation measured here produces today, against a release pipeline that in one observed consumer had converted 1,132 merged pull requests into zero tagged releases. Individual capability is not the constraint at that point — downstream absorption is. Build: a shared capacity ledger across operators covering token spend, concurrent lanes, and per-surface change rate, with backpressure derived from downstream signals (release throughput, review queue depth, integration failures) rather than from upstream willingness. A team that can generate more change than it can absorb needs the governor at the team boundary.
- **Blockers:** Depends on `budget-governor-for-unattended-dispatch` and `merged-but-unreleased-inventory-metric` for its inputs
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1537
