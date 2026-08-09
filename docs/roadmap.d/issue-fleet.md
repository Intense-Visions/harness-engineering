---
slug: "issue-fleet"
milestone: "Fleet Family — Batch Orchestration"
order: 1
---

### issue-fleet — autonomous intake/triage of the open-issue backlog

- **Status:** done
- **Spec:** docs/changes/issue-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. issue-fleet is the intake stage: it autonomously triages the open-issue backlog (labeling, deduping, routing, and prioritizing) so downstream fleets receive a clean, ordered queue. It is the entry point of the fleet spine issue-fleet → adr-fleet → roadmap-fleet → pr-fleet, with cicd-fleet / test-fleet / cleanup-fleet running alongside.
- **Blockers:** —
- **Plan:** docs/changes/issue-fleet/plans/2026-08-08-issue-fleet-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1195
