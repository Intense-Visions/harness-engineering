---
'@harness-engineering/cli': minor
---

feat(graph): add get_graph_schema MCP introspection tool

New read-only MCP tool `get_graph_schema` returns the knowledge graph's SHAPE so an
agent can discover it before querying — the missing counterpart to `query_graph`,
`ask_graph`, `get_relationships`, `search_similar`, `compute_blast_radius`, and
`find_context_for`, all of which require you to already know the schema.

It aggregates over the already-persisted node/edge records (no new datastore, no
scan, no write) and emits a stable JSON shape:
`{ nodeTypes: [{ label, count, properties }], edgeTypes: [{ type, count }],
patterns: [{ from, edge, to, count }], totals: { nodeCount, edgeCount } }` —
per-label node counts with their observed property keys, per-type edge counts, and
the distinct `(fromLabel, edgeType, toLabel)` relationship patterns present. Wired
into the served tool registry with a `read` capability declaration.
