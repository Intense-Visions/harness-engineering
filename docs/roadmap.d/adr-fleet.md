---
slug: "adr-fleet"
milestone: "Fleet Family — Batch Orchestration"
order: 2
---

### adr-fleet — batch-drive pending architectural decisions to ADRs

- **Status:** done
- **Spec:** —
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. adr-fleet sweeps the backlog of pending architectural decisions and drives each to a batch ADR sign-off, fanning out drafting work and collecting the results for a single human review pass. It sits second in the fleet spine issue-fleet → adr-fleet → roadmap-fleet → pr-fleet, with cicd-fleet / test-fleet / cleanup-fleet running alongside.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1197
