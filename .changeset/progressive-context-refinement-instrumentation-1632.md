---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Add refinement-request instrumentation (progressive-context demand signal, scoped slice of #1632).

Logs every refinement request (`code_outline` / `code_search` / `code_unfold`) with its
progressive context class (`file-content` | `history` | `telemetry` | `knowledge`) to
`.harness/metrics/refinement-events.jsonl`, and aggregates it into refinement-frequency-per-context-class —
the demand signal for rate-distortion compaction and trained-dictionary membership scoring.

- `@harness-engineering/core`: new pure `refinement-demand` module (taxonomy, `classifyRefinement`,
  `aggregateDemand` — enumerates every class so a never-read class ranks last).
- `@harness-engineering/cli`: non-fatal JSONL writer/reader (`refinement-telemetry`), instrumentation
  wired into the three code-nav handlers, and a new `harness mcp refinement-demand [--json]` report subcommand.

Deferred to a follow-up slice: the progressive-by-default contract for every context class and the
prefetch/batching policy.
