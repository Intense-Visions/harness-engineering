---
'@harness-engineering/intelligence': patch
'@harness-engineering/orchestrator': patch
'@harness-engineering/cli': patch
---

fix(triage): don't label a deferred open-decisions lever as "no provider (offline)"

The cheap-first report holds obviously-out-of-band items (scope-too-large, not-in-band) before
spending an LLM call, so their open-decisions lever runs without a provider and printed
`open-decisions: no provider (offline)` — misleading, since a provider WAS available and the
lever was simply deferred, not missing/mis-configured.

New `ProbeDeps.modelDeferred` hint (threaded through `triageIssue`): when a model is available
but its levers were deferred for a cheap pass, the reason reads `not evaluated (item held before
the model pass)`. A genuinely offline run (`--offline` / no provider wired) still reads
`no provider (offline)`. Wording only — the lever value stays `unknown` and the gate never
dispatches on an unread lever either way.
