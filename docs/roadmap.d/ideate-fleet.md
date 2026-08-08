---
slug: "ideate-fleet"
milestone: "Fleet Family — Batch Orchestration"
order: 9
---

### ideate-fleet — fan out strategy-grounded ideation as the head of the fleet spine

- **Status:** in-progress
- **Spec:** docs/changes/ideate-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. ideate-fleet is the head of the core conveyor (ideate → issue → adr → roadmap → pr): it derives a queue of disjoint themes from STRATEGY.md tracks and supplied opportunity areas, fans out worktree-isolated subagents that each run the real `harness-ideate` pipeline to a ranked artifact, re-derives every ranking independently, and returns one curated ranked shortlist for a human to pick from. It files nothing — no issue, roadmap row, spec, or PR.
- **Blockers:** —
- **Plan:** docs/changes/ideate-fleet/plans/2026-08-08-ideate-fleet-plan.md
- **Assignee:** Chad Warner
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1228
