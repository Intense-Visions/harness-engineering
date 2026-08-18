---
slug: "canonical-bounded-handoff-record-for-fleet-workers"
milestone: "Intake"
order: 46
---

### Canonical bounded handoff record for fleet workers

- **Status:** done
- **Spec:** —
- **Summary:** Define one shared handoff schema — status, summary, evidence, next_steps, blocker — modeled on dsh's Ralph-loop handoff ("the normalized bounded structured report passed from one continuing Ralph round to the next"). Require every fleet family member (bug-fleet, roadmap-fleet, pr-fleet, cicd-fleet, cleanup-fleet, security-fleet, test-fleet, issue-fleet, adr-fleet) to emit it from each worktree-isolated worker instead of each fleet defining its own ad hoc report shape, so fleet-command can parse any fleet's worker output uniformly instead of special-casing each one. Likely lands as a shared type in @harness-engineering/types plus a validation helper.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1396
