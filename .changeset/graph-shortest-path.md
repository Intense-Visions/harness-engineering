---
'@harness-engineering/graph': minor
'@harness-engineering/cli': minor
---

Add a `shortestPath(a, b)` query primitive to ContextQL. `GraphStore.shortestPath`
performs an unweighted BFS between two arbitrary nodes and returns the ordered
node/edge path (or `null` when unreachable); `ContextQL.shortestPath` exposes it
as a query-primitive surface. The NLQ layer gains a `shortestPath` intent
(source + target extraction, surfaced through `ask_graph`), and the CLI gains a
`harness graph path <sourceNodeId> <targetNodeId>` verb with a `--direction`
option. Traces to ADR 0104 (Option-A capability port).
