---
slug: "adr-crud-as-an-mcp-tool"
milestone: "Intake"
order: 43
---

### ADR CRUD as an MCP tool

- **Status:** done
- **Spec:** —
- **Summary:** Expose Architecture Decision Records as a structured MCP tool (create / read / update / list) rather than only as skill-mediated prose. Harness has `harness:adr-fleet` (batch ADR drafting) and `harness:architecture-advisor` (interactive decision surfacing) as skills, and a `DecisionIngestor` that folds ADRs into the knowledge graph — but `ls packages/cli/src/mcp/tools/ | grep -i "adr\|decision"` returns nothing, so no caller can create or amend an ADR programmatically. Adopted from `DeusData/codebase-memory-mcp`'s `manage_adr` tool, which additionally notes a useful concurrency property: query modes do not block behind a same-project reindex while writes remain serialized. Narrow in scope and adjacent to work `adr-fleet` already owns, so the main design question is whether this belongs as its own tool or as an extension of the adr-fleet surface. Matrix: docs/ideation/external-source-feature-matrix-2026-08-10.md (score 3.00).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1283
