---
slug: "on-demand-maintenance-pipeline"
milestone: "Intake"
order: 2
---

### On-Demand Maintenance Pipeline

- **Status:** done
- **Spec:** docs/changes/maintenance-pipeline/proposal.md
- **Summary:** Build the deferred `harness maintenance run` (overdue-aware, report-first, `--fix` opt-in) on the existing 22-task maintenance registry by threading a `mode: report|fix` through `TaskRunner`, plus a thin `/harness:maintenance-pipeline` skill on top. One executor, one registry — gives developers an on-demand way to run the maintenance that is actually overdue without a running orchestrator. Source: /harness:brainstorming.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** —
- **Updated-At:** 2026-06-28T00:00:00.000Z
