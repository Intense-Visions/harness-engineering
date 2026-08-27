---
'@harness-engineering/types': minor
'@harness-engineering/orchestrator': minor
---

fleet: assemble a dispatched leaf's context graph-scoped by default (#1524 deferred slice)

Every dispatched-leaf stage prompt now carries a directive to retrieve existing
code via `code_outline` / `code_unfold` / `find_context_for` first and read raw
whole-file source only for the region under edit — attacking the dominant
context-replay cost term (the assembled context size fleet fan-out multiplies)
without losing correctness. Graph-scoped is the default (`DEFAULT_RETRIEVAL_MODE`);
`agent.retrievalMode: 'raw'` is the explicit, byte-identical opt-out. Refs #1524.
