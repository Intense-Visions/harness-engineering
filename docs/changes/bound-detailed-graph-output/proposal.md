---
title: Bound detailed-mode output for graph retrieval tools on hub nodes
issue: 1591
status: planned
keywords:
  - graph-tools
  - detailed-mode
  - pagination
  - token-ceiling
  - hub-nodes
  - fail-soft-truncation
  - get_impact
  - query_graph
  - compute_blast_radius
---

# Bound detailed-mode output for graph retrieval tools on hub nodes

## Overview

The reproducible graph token-savings benchmark (#1271, `docs/benchmarks/graph-token-savings/RESULTS.md`)
measured graph-scoped retrieval at 26.5× fewer tokens overall — but recorded a sharp exception
(caveat 3): the **detailed-mode** payloads of `get_impact` and `query_graph`, when run against the
graph's **hub (high-degree) nodes**, are **unbounded**. On this repo's own graph they serialized to
**≈293M tokens** (5 `impact` anchors, full bidirectional 3-hop neighborhood) and **≈4.47M tokens**
(5 `dependencies` anchors). A single such call can dwarf every saving the graph tools otherwise
deliver and can overflow an agent's entire context window.

This change bounds detailed-mode output for the affected graph retrieval handlers so that **no
detailed call can return an unbounded payload**, while preserving the drill-in usefulness of
detailed mode for small/normal nodes.

### Goals

- No `get_impact` / `query_graph` / `compute_blast_radius` detailed-mode response can exceed a
  bounded, configurable item ceiling.
- Truncation is **fail-soft and explicit**: a truncated response carries `truncated: true` plus a
  continuation signal so a caller can page — never a silent 293M-token dump.
- The default ceiling is derived from the benchmark's own numbers and exposed as configuration.
- The behavior of small nodes (below the ceiling) is unchanged.

### Out of scope

- Changing summary/compact modes (they are already bounded — that is the whole point of scoping).
- Changing traversal depth defaults or graph ingestion.
- The answer-quality axis (LLM-judge comparator) — a separate deferred slice of #1271.

## Decisions made

1. **Count-based item ceiling, not a serialized-byte/token meter.** Cap the number of items in each
   otherwise-unbounded array (impacted nodes, edges, cascade layers) at a fixed ceiling.
   - _Rationale:_ deterministic and cheap — no need to serialize-then-measure a 293M-token payload
     to discover it is too big (defeating the purpose). It is consistent with the pagination
     `query_graph` detailed mode already uses (`offset`/`limit`, `paginate()` from
     `@harness-engineering/core`, `packages/core/src/compaction/pagination.ts`). Node serialized
     size is roughly uniform, so an item count is a good proxy for token cost.

2. **Default ceiling = 200 items per array, derived from the benchmark.** The 293M-token blowup
   comes from materializing tens-of-thousands of nodes/edges. At a rough ~125 tokens per serialized
   graph item, a 200-item ceiling holds a detailed response near ~25k tokens — a >4-orders-of-magnitude
   reduction from 293M, while still returning far more than the summary surface (which returns only
   counts + top items). `query_graph`'s existing node page default (`limit: 50`) sits comfortably
   under this ceiling and is preserved.

3. **Expose the ceiling as configuration with a sane default.** New optional
   `graph.detailedMode.maxItems` key in `harness.config.json` (schema in
   `packages/cli/src/config/schema.ts`), falling back to the exported
   `DEFAULT_GRAPH_DETAIL_CEILING` constant. Zero-config projects are bounded by default.

4. **Fail-soft continuation contract.** A bounded array is produced by a shared core helper
   `boundItems(items, ceiling)` returning `{ items, truncated, totalAvailable, returned }`. When
   `truncated` is true the handler response carries a top-level `truncated: true` and a
   `continuation` hint that names the ceiling, the total available, and how to retrieve more
   (page via `offset`/`limit` for `query_graph`; narrow the anchor or use summary mode for
   `get_impact` / `compute_blast_radius`).

5. **Bound all three named handlers → `Closes #1591`.** `compute_blast_radius` detailed mode
   (`layers` + `flatSummary`) exhibits the same unbounded class and is bounded here too, so the
   issue is fully resolved rather than partially (`Refs`).

## Technical design

### New shared core helper (`@harness-engineering/core`, compaction module)

`packages/core/src/compaction/detail-ceiling.ts`:

```ts
export const DEFAULT_GRAPH_DETAIL_CEILING = 200;

export interface BoundedItems<T> {
  items: T[];
  /** True when the input exceeded the ceiling and was truncated. */
  truncated: boolean;
  /** Total items available before truncation. */
  totalAvailable: number;
  /** Number of items actually returned (<= ceiling). */
  returned: number;
}

export function boundItems<T>(items: readonly T[], ceiling?: number): BoundedItems<T>;
```

Re-exported from `packages/core/src/compaction/index.ts` (already `export *`-ed by the core
barrel) and added to the `scripts/generate-core-barrel.mjs` allowlist if required.

### Config

`graph.detailedMode.maxItems` — optional positive integer. Added to the existing `graph` object in
`HarnessConfigSchema` (`packages/cli/src/config/schema.ts`). Handlers resolve it via
`resolveConfig(path)` and fall back to `DEFAULT_GRAPH_DETAIL_CEILING` when absent or on any config
error (fail-open to the safe default — the ceiling still applies).

### Handler wiring (`packages/cli/src/mcp/tools/graph/`)

- **`get-impact.ts` (`handleGetImpact` → tool `get_impact`)** — detailed branch: bound the flattened
  impacted-node set and the `edges` array via `boundItems`. Response gains `truncated` +
  `continuation` when either array is truncated. Summary mode unchanged.
- **`query-graph.ts` (`handleQueryGraph` → tool `query_graph`)** — nodes remain offset/limit
  paginated (already bounded). The `edges` array — currently `result.edges.filter(...)`, unbounded
  when a hub node is on the page — is bounded via `boundItems`. Response `truncated` becomes true if
  node pagination `hasMore` OR edges were truncated; `continuation` merges the existing `pagination`.
- **`compute-blast-radius.ts` (`handleComputeBlastRadius` → tool `compute_blast_radius`)** — detailed
  branch: bound `flatSummary` and the per-layer node arrays inside `layers` via `boundItems`.
  Response gains `truncated` + `continuation`. Compact mode (default) unchanged.

### File layout

| File                                                               | Change                                   |
| ------------------------------------------------------------------ | ---------------------------------------- |
| `packages/core/src/compaction/detail-ceiling.ts`                   | **new** — helper + default constant      |
| `packages/core/src/compaction/index.ts`                            | export new symbols                       |
| `packages/core/src/compaction/detail-ceiling.test.ts`              | **new** — unit tests for helper          |
| `scripts/generate-core-barrel.mjs`                                 | allowlist entry if barrel requires       |
| `packages/cli/src/config/schema.ts`                                | `graph.detailedMode.maxItems`            |
| `packages/cli/src/mcp/tools/graph/get-impact.ts`                   | bound detailed output                    |
| `packages/cli/src/mcp/tools/graph/query-graph.ts`                  | bound edges                              |
| `packages/cli/src/mcp/tools/graph/compute-blast-radius.ts`         | bound detailed output                    |
| `packages/cli/src/mcp/tools/graph/detail-ceiling.behavior.test.ts` | **new** — hub-node bounding proof        |
| `docs/reference/*`                                                 | regenerated via `pnpm run generate-docs` |

## Integration points

### Entry points

Three existing MCP tools (`get_impact`, `query_graph`, `compute_blast_radius`) registered in
`packages/cli/src/mcp/server.ts`. No new entry points; behavior of existing ones is bounded.

### Registrations required

- New core exports (`boundItems`, `DEFAULT_GRAPH_DETAIL_CEILING`, `BoundedItems`) via
  `packages/core/src/compaction/index.ts` and the core barrel allowlist
  (`scripts/generate-core-barrel.mjs`) if the generator requires it.
- `docs/reference/*` regenerated for the new config key.

### Documentation updates

`docs/reference/*` regenerated. The benchmark caveat 3 in
`docs/benchmarks/graph-token-savings/RESULTS.md` is now addressed by this bound (no edit required —
it records the finding, which remains historically accurate).

### Architectural decisions

None rise to a standalone ADR — this is a bounded, localized guardrail on three existing handlers,
consistent with the existing pagination pattern.

### Knowledge impact

Concept: "graph detailed-mode responses are bounded by a configurable item ceiling with fail-soft
truncation." Relationship: the three graph retrieval tools depend on the shared `boundItems` helper.

## Success criteria

1. **When** `get_impact` runs in detailed mode against a hub node whose impacted set exceeds the
   ceiling, **the** response **shall** contain at most `maxItems` nodes and at most `maxItems` edges,
   and **shall** set `truncated: true` with a `continuation` signal. (observable in the JSON payload)
2. **When** `get_impact` runs in detailed mode against a small node (below the ceiling), **the**
   response **shall** be unchanged (`truncated` absent/false, all items present).
3. **When** `query_graph` detailed mode returns a hub node whose incident edges exceed the ceiling,
   **the** `edges` array **shall** be bounded and `truncated: true` set.
4. **When** `compute_blast_radius` runs in detailed mode against a hub node, **the** cascade payload
   (`flatSummary` / `layers`) **shall** be bounded and `truncated: true` set.
5. The ceiling **shall** be overridable via `graph.detailedMode.maxItems` and **shall** default to
   `DEFAULT_GRAPH_DETAIL_CEILING` (200) when unconfigured.
6. All existing graph-tool tests pass; new behavior test proves the hub-node bound + small-node
   passthrough; all-OS CI green.

## Implementation order

1. Core helper `boundItems` + `DEFAULT_GRAPH_DETAIL_CEILING` + unit tests; export + barrel.
2. Config schema `graph.detailedMode.maxItems`.
3. Wire `get_impact`, then `query_graph` edges, then `compute_blast_radius`.
4. Behavior test: synthetic hub-node graph proves bound + truncated flag; small node unchanged.
5. `pnpm run generate-docs`; build CLI; run graph tests + typecheck; ship.

## Assumptions made

- Count-based ceiling (200 items/array) is an acceptable proxy for the token ceiling the issue asks
  for; a byte/token meter is intentionally rejected as it would require materializing the very
  payload we are trying not to build.
- Fail-open on config read error (apply the default ceiling) is safer than failing the tool call.
- `query_graph`'s existing node pagination is retained; only its unbounded `edges` array needed
  bounding.
