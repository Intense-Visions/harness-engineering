---
title: Graph schema introspection tool (get_graph_schema)
status: draft
tier: low
roadmap: graph-schema-introspection
external-id: github:Intense-Visions/harness-engineering#1280
keywords: knowledge-graph, mcp-tool, introspection, schema, discovery, read-only
---

## Overview

Roadmap item #1280 observes an asymmetry in the knowledge-graph MCP surface: the
harness exposes `query_graph`, `ask_graph`, `get_relationships`, `search_similar`,
`compute_blast_radius`, and `find_context_for` — every one of which requires the
caller to **already know** the graph's shape (which node types exist, which edge
types connect them, what properties a node of a given type carries). Nothing
enumerates the schema. An agent discovering an unfamiliar project's graph has no
read-only way to answer "what is in here and how is it connected?" before it can
form a query.

This spec adds a single new read-only MCP tool, `get_graph_schema`, that returns
the graph's SHAPE — not its data. It aggregates over the already-persisted node
and edge records (no new datastore, no scan, no write) and reports:

- **node types (labels)** present, with a count and the union of property keys
  observed on nodes of that type;
- **edge types (relationships)** present, with a count;
- **relationship patterns** — the distinct `(fromLabel, edgeType, toLabel)`
  triples actually present in the graph, each with a count.

The tool is the natural "index page" for the graph: an agent calls it first, then
uses the returned labels/edge-types/patterns as valid inputs to the existing query
tools.

## Root-cause / gap confirmation

- `packages/cli/src/mcp/tools/graph/` contains the six read tools above; none of
  them enumerates types. `query_graph` can _summarize_ the node/edge type counts
  **of a traversal result**, but only once you already have `rootNodeIds` — it
  cannot answer "what types exist" cold.
- `GraphStore` (`packages/graph/src/store/GraphStore.ts`) already exposes
  everything needed: `findNodes({})` returns all nodes and `getEdges({})` returns
  all edges; both node and edge records carry a `type`, and nodes carry a
  `metadata` bag plus top-level fields. No new storage or index is required.
- The on-disk graph is loaded read-only via the existing `loadGraphStore`
  loader used by every other graph tool, so the tool inherits the same
  worktree-fallback and caching behavior for free.

## Observable Truths (Acceptance Criteria)

1. A new MCP tool named `get_graph_schema` is **defined** (`getGraphSchemaDefinition`)
   and **registered** in the served tool registry (`packages/cli/src/mcp/server.ts`)
   — it appears in the tools list, has a `read` capability declaration, and its
   handler is wired in `TOOL_HANDLERS`. _(observable: registry test asserts the
   tool name is present; capability declaration present)_
2. Given a project with a persisted graph, `get_graph_schema` returns the MCP
   text envelope whose JSON payload has the stable shape
   `{ nodeTypes: [{ label, count, properties: [...] }], edgeTypes: [{ type, count }],
patterns: [{ from, edge, to, count }], totals: { nodeCount, edgeCount } }`.
   _(observable: integration test over a seeded graph)_
3. Over a small seeded graph, the reported per-label `count` values equal the
   actual number of nodes of that label; `edgeTypes[].count` equals the actual
   number of edges of that type; and each `patterns[]` entry corresponds to a
   real `(from,edge,to)` triple with the correct count. _(observable: assertions
   on exact counts)_
4. `nodeTypes[].properties` is the sorted union of property keys present on nodes
   of that label (top-level defined fields plus `metadata` keys), and is
   deterministic (stable ordering) across runs. _(observable: assertion on the
   property array)_
5. The tool is read-only and side-effect free: it never writes to disk and returns
   the graph-not-found envelope (`isError: true`, "No graph found") when no graph
   exists — matching the other graph tools' guard behavior. _(observable: guard
   test on an empty temp dir)_
6. The tool is documented in `docs/reference/mcp-tools.md` (auto-generated) and the
   new source file is link-referenced by a `docs/` page so doc coverage passes.
   _(observable: generate-docs output contains `get_graph_schema`)_

## Non-goals

- No new datastore, index, or scan. Aggregation is over existing records only.
- No mutation surface. The tool is strictly read.
- No pagination in v1 — the schema (distinct types/patterns) is bounded by the
  fixed `NODE_TYPES`/`EDGE_TYPES` enums (tens of entries), not by graph size.
- No embedding/content inspection; only structural shape.

## Assumptions

- [ASSUMPTION] Tool name `get_graph_schema` matches the repo's `get_*`/`query_*`
  graph-tool naming convention (`get_relationships`, `get_impact`, `query_graph`).
- [ASSUMPTION] "Property definitions" = the observed union of property keys per
  label (top-level `GraphNode` fields that are set, plus `metadata` object keys).
  We report key names, not value types, since node metadata is untyped
  (`Record<string, unknown>`).
- [ASSUMPTION] Owning package for the changeset is `@harness-engineering/cli`
  (the MCP tool lives there); minor bump (new feature / new tool).
- [ASSUMPTION] `patterns[]` resolves `from`/`to` labels by looking up each edge's
  endpoint nodes; edges whose endpoints are absent from the node set are grouped
  under the sentinel label `unknown` so counts still reconcile.
