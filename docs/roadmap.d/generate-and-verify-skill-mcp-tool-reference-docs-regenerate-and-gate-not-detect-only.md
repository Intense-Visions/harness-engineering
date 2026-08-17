---
slug: "generate-and-verify-skill-mcp-tool-reference-docs-regenerate-and-gate-not-detect-only"
milestone: "Intake"
order: 45
---

### Generate-and-verify skill/MCP-tool reference docs (regenerate-and-gate, not detect-only)

- **Status:** planned
- **Spec:** —
- **Summary:** Port dsh's gen-tool-catalog/verify-tool-catalog pattern (deepseek-ai/deepseek-harness docs/tool-catalog.md): boot each shipped skill and MCP tool definition against a real context, extract its live name/description/schema, generate a canonical docs/reference/*.md catalog from that, and add a verify mode that regenerates in CI and fails the build on any diff — the same shape as generate-docs / generate-barrel-exports:check today. Upgrades detect-doc-drift from advisory detection to a hard regenerate+gate loop for the skill/tool catalog specifically, closing the gap where a tool's real schema and its documented schema silently diverge. Reference: reference_deepseek_harness_analysis.md (memory).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1401
