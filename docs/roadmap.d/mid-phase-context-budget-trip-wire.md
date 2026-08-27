---
slug: "mid-phase-context-budget-trip-wire"
milestone: "Planning & Process"
order: 9
---

### Mid-Phase Context-Budget Trip Wire

- **Status:** done
- **Spec:** docs/changes/mid-phase-context-budget-trip-wire/proposal.md
- **Summary:** Fresh-context discipline in autopilot holds only between phases (each state dispatches a new cold subagent via subagent_type) — nothing watches a single long-running harness-task-executor turn or fleet lane for context creep within its own turn. Add a documented context-utilization threshold (a reasonable starting point is HumanLayer's own measured ~40%) that triggers an explicit write-state-and-restart action instead of leaving degradation to whatever the model does near its own context ceiling. Adapted from Dex Horthy/HumanLayer's "smart zone"/"dumb zone" context-engineering practice. Adoption #1 from docs/research/dex-horthy-humanlayer-comparison-analysis.md [HORTHY-1]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1403
