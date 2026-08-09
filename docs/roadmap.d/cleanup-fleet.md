---
slug: "cleanup-fleet"
milestone: "Fleet Family — Batch Orchestration"
order: 7
---

### cleanup-fleet — autonomous entropy/hotspot remediation sweep

- **Status:** done
- **Spec:** docs/changes/cleanup-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. cleanup-fleet sweeps the entropy/hotspot backlog, fanning out remediation across high-churn and high-risk areas and batching the resulting cleanup PRs for human review. It runs alongside the core fleet spine issue-fleet → adr-fleet → roadmap-fleet → pr-fleet.
- **Blockers:** —
- **Plan:** docs/changes/cleanup-fleet/plans/2026-08-08-cleanup-fleet-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1200
