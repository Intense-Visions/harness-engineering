---
slug: "standardize-parallel-execution"
milestone: "Parallel Execution & State"
order: 7
---

### Standardize Parallel Execution

- **Status:** planned
- **Spec:** docs/changes/standardize-parallel-execution/proposal.md
- **Summary:** Compose the harness's existing parallelism primitives (findParallelGroups wave-grouper, predict_conflicts, worktree isolation) into the standard execution path so sound parallel execution fires automatically instead of only when a human asks. Adds a shared parallelization-planner sub-protocol emitting a ParallelizationPlan (waves + severity + per-wave firing decision), a `dependsOn` task-schema field, and risk-tiered non-blocking dispatch (clean waves announce-and-go, medium/graph-unavailable confirm once, high-severity auto-serialize) wired into harness-autopilot EXECUTE. Execution-first; parallel planning/research and smart-merge (#600) are named follow-ons.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** —
