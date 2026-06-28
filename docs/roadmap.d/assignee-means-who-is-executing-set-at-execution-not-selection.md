---
slug: "assignee-means-who-is-executing-set-at-execution-not-selection"
milestone: "Intake"
order: 1
---

### Assignee means who is executing — set at execution, not selection

- **Status:** done
- **Spec:** docs/changes/assignee-execution-lifecycle/proposal.md
- **Summary:** Establish the invariant assignee ≠ null ⟺ in-progress via a centralized core authority: roadmap-pilot stops assigning at selection, harness-execution claims at execution start, machine claims never use the GitHub assignee field, inbound sync never clobbers a live machine claim, and RMH005 + groom enforce/migrate. Fixes the orchestrator silently skipping pilot-touched items.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#640
- **Updated-At:** 2026-06-26T17:46:10.000Z
