---
'@harness-engineering/core': patch
---

perf(arch): parse each file once per `check-arch` run instead of once per dependency collector (#2270)

The circular-deps, layer-violations and forbidden-imports collectors each parsed every file they read, so a file all three cover was parsed three times per `harness check-arch` / `harness ci check` / dashboard arch refresh (8,405 parses on this repo). `runAll` now hands every collector one run-scoped context whose parser memoizes each file's imports, which drops that to 4,779 — one per distinct file — with every collector's output unchanged. The memo lives only for one `runAll` call, so long-lived hosts (MCP server, dashboard, orchestrator) never reuse a parse across runs.

`Collector.collect` gains an optional third `context` argument; collectors that ignore it, and direct calls that omit it, behave exactly as before.
