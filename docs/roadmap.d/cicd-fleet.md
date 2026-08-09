---
slug: "cicd-fleet"
milestone: "Fleet Family — Batch Orchestration"
order: 5
---

### cicd-fleet — autonomous CI/CD-red / flaky-test backlog sweep

- **Status:** done
- **Spec:** docs/changes/cicd-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. cicd-fleet sweeps the CI/CD-red and flaky-test backlog, fanning out diagnosis and fixes across failing pipelines and batching remediation PRs for human review. It runs alongside the core fleet spine issue-fleet → adr-fleet → roadmap-fleet → pr-fleet.
- **Blockers:** —
- **Plan:** docs/changes/cicd-fleet/plans/2026-08-08-cicd-fleet-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1196
