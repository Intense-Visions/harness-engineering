---
'@harness-engineering/cli': minor
'@harness-engineering/core': minor
---

Bound detailed-mode output of the graph retrieval MCP tools on hub (high-degree) nodes (issue #1591). The token-savings benchmark (#1271) found `get_impact` / `query_graph` / `compute_blast_radius` detailed-mode payloads on hub nodes were unbounded — serializing to ~293M / ~4.47M tokens and able to overflow an agent's context. Each detailed-mode response array is now capped by a configurable item ceiling (`graph.detailedMode.maxItems`, default `DEFAULT_GRAPH_DETAIL_CEILING = 200`). When output is truncated the response fails soft with `truncated: true` plus a `continuation` signal (naming the ceiling, totals available, and how to page or scope down) instead of silently returning a giant payload. Small nodes below the ceiling are unchanged. Adds the `boundItems` helper to `@harness-engineering/core`.
