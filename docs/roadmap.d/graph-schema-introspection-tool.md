---
slug: "graph-schema-introspection-tool"
milestone: "Intake"
order: 40
---

### Graph schema introspection tool

- **Status:** planned
- **Spec:** —
- **Summary:** Expose a `get_graph_schema`-equivalent MCP tool returning node/edge counts, relationship patterns and per-label property definitions, so an agent can discover the graph's shape before querying it. Harness exposes `query_graph`, `ask_graph`, `get_relationships`, `search_similar`, `compute_blast_radius` and `find_context_for` but nothing that enumerates what node types and edge types exist — `ls packages/cli/src/mcp/tools/ | grep -i schema` returns only the unrelated `interaction-schemas.ts`. An agent must therefore already know the schema to query it, or guess. Adopted from `DeusData/codebase-memory-mcp` (38.3k stars, MIT), whose equivalent tool description reads "Run this first." Cheap, and it raises the usable yield of every other graph tool for agents that did not author them. Feature-level finding — invisible at source level, surfaced only by enumerating that project's 15 MCP tools. Matrix: docs/ideation/external-source-feature-matrix-2026-08-10.md (score 6.00).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1280
