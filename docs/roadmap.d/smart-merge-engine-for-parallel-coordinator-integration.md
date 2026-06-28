---
slug: "smart-merge-engine-for-parallel-coordinator-integration"
milestone: "Parallel Execution & State"
order: 3
---

### Smart-Merge Engine for Parallel-Coordinator Integration

- **Status:** planned
- **Spec:** —
- **Summary:** Port a preflight -> conflict-forecast -> classify -> resolve -> resumable-merge-state pipeline into harness's worktree integration path, replacing the current basic git 3-way + cherry-pick. Predicts conflicts before merging and persists resumable state so an interrupted multi-agent integration can recover. Closes the integration bottleneck for parallel-coordinator execution. Adapted from Spec Kitty's merge/ smart-merge engine. Adoption #3 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-3]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#600
