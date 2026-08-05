---
slug: "strip-internal-roadmap-pr-references-from-shipped-skills-artifacts"
milestone: "v5.0 — Trust & Security Model"
order: 6
---

### Strip internal roadmap/PR references from shipped skills & artifacts

- **Status:** planned
- **Spec:** docs/changes/shipped-skill-ref-hygiene/proposal.md
- **Summary:** Shipped skills, slash commands, subagent defs, plugin bodies, and MCP tool description strings are distributed to adopter projects but leak harness-engineering-internal references (roadmap/PR/issue numbers, sub-project indices) meaningless to adopters. Genericize (not delete) so shipped text stays meaningful, regenerate distributed artifacts, add a grep/test guard so new leaks are caught. Internal linkage stays in specs/commits/PR bodies. Principle: shipped/rendered text = generic; code comments = internal-linkage OK.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1059
