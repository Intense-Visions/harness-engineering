---
'@harness-engineering/cli': patch
---

feat(skill-authoring): require Service Definition / Provider / Consumer capability roles

`harness-skill-authoring` now requires every new MCP tool or skill capability to
name all three capability-seam roles before it ships: a Service Definition (what it
DEFINES), at least one Provider (who PROVIDES it), and at least one Consumer (who
CONSUMES it). A capability with only one role filled is accidental
single-implementation lock-in dressed up as an extension point.

- New `Phase 1C: DECLARE CAPABILITY ROLES` section, a "no half-wired capabilities"
  gate, and a matching rationalization in the skill guidance.
- The `create_skill` scaffold now emits a `## Capability Roles` checklist in the
  generated `SKILL.md`, prompting the author for all three roles.
- Targeted retrofit: the same `## Capability Roles` block is applied to the existing
  skills that genuinely define a capability seam — the design verifier interface
  (`harness-design-pipeline` over `detect-design-drift` / `audit-component-anatomy` /
  `audit-brand-compliance`), the craft LLM-judgment-critique contract (`craft-fleet`
  over the eleven `*-craft` skills), and the `-fleet` family spine (`fleet-command`
  over the fleet members). Non-seam skills are deliberately left untouched.
