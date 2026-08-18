---
slug: "require-service-definition-provider-consumer-roles-in-skill-authoring-guidance"
milestone: "Intake"
order: 47
---

### Require Service-Definition/Provider/Consumer roles in skill-authoring guidance

- **Status:** done
- **Spec:** —
- **Summary:** dsh's capability-seam model requires every extension point to name a Service Definition, at least one Provider, and at least one Consumer — a capability with only one role filled in is flagged as not actually swappable. Add an equivalent lightweight requirement to harness-skill-authoring: when a new MCP tool or skill capability is proposed, its author states what it defines, who provides it, and who consumes it. Catches half-wired capabilities before they ship as accidental single-implementation lock-in. Likely a new section in agents/skills/claude-code/harness-skill-authoring/SKILL.md plus a checklist item surfaced by create_skill.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1397
