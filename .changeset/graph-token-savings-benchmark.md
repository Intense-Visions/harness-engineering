---
'@harness-engineering/cli': minor
---

Add a reproducible graph token-savings benchmark (`harness graph bench` / `pnpm run bench:graph-tokens`, issue #1271). It measures two objective, deterministic axes — retrieval tokens and tool calls — for graph-scoped retrieval (the real shipped `get_impact` / `compute_blast_radius` / `query_graph` / `code_outline` / `find_context_for` / `ask_graph` handlers, in their context-scoping density modes) versus a naive filesystem search + full-file-read baseline, on the project's own graph. On this repo it measures 26.5× fewer tokens and 44.5× fewer tool calls overall (find-context is an honestly-reported 0.72× loss; detailed-mode payloads on hub nodes are a documented worst-case finding). The methodology and recorded number are published under `docs/benchmarks/graph-token-savings/`. Answer quality (the comparator's 83% axis) and a multi-repo corpus are documented as deferred slices.
