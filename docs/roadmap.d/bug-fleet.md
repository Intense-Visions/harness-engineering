---
slug: "bug-fleet"
milestone: "Fleet Family — Batch Orchestration"
order: 8
---

### bug-fleet — proactive undiscovered-bug hunt across the standing codebase

- **Status:** done
- **Spec:** docs/changes/bug-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. bug-fleet is the proactive correctness hunter: it ranks the standing codebase into risk-ordered areas, hunts each with the real review machinery, and holds a REPRODUCTION-REQUIRED bar (no failing test, no bug) before emitting a tiered batch of fix PRs and filed issues. It runs alongside the core fleet spine issue-fleet → adr-fleet → roadmap-fleet → pr-fleet.
- **Blockers:** —
- **Plan:** docs/changes/bug-fleet/plans/2026-08-08-bug-fleet-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1225
