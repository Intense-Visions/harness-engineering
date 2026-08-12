---
'@harness-engineering/graph': minor
'@harness-engineering/cli': minor
---

feat(graph): add `harness graph integrity` and the harness-graph-integrity skill

`harness graph status` reports how big the graph is, never whether its contents
can be trusted. Two defect classes live in that gap, and both currently read as
green:

- A connector that never authenticated still reports a fresh
  `last synced <timestamp>`, because the status reader narrows each connector's
  `lastResult` to a bare timestamp and discards `errors` and the counts (#1336).
- The code extractors mint `business_term` nodes out of prose — the canonical
  instance being `enum or { function, const, if, if, if, return }` (#1331). Such
  a node cannot be cleared by re-ingesting; it is re-derived from unchanged
  source on every run.

Adds `checkGraphIntegrity` to `@harness-engineering/graph` and a
`harness graph integrity` subcommand that surfaces both, plus the
`harness-graph-integrity` skill across all four platforms. Following #1146, the
report carries its denominators and exits `ZERO_DENOMINATOR` when it inspected
nothing, so an abstention can never be read as a pass.

Additive only: no existing command, output, or exit code changes.
