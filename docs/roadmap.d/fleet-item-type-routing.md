---
slug: "fleet-item-type-routing"
milestone: "Fleet Family — Batch Orchestration"
order: 20
---

### fleet-item-type-routing — build-shaped fleets route by item type (bug vs feature)

- **Status:** planned
- **Spec:** docs/changes/fleet-item-type-routing/proposal.md
- **Summary:** The build-shaped `-fleet` members (`roadmap-fleet`, `security-fleet`) forced every item through the design-first pipeline `harness-brainstorming → harness-autopilot`, so a bug tracked as a backlog/roadmap item got design ceremony it did not need and then stalled in autopilot for lack of an Implementation Order. This item makes those members classify each item by type and route it: `bug` → `harness-debugging`, approved-spec → `harness-autopilot`, new-feature/ambiguous → `harness-brainstorming → harness-autopilot`. The rubric is stated once in `docs/reference/fleet-family.md` (§Item-type routing, ADR 0103) and referenced by both fleets; classification happens at SELECT (metadata-first, router-rubric fallback), is human-overridable at CONFIRM, and VERIFY checks route-appropriate artifacts. `bug-fleet` / `cicd-fleet` already route to debugging and are unchanged.
- **Blockers:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** —
