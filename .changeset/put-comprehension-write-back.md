---
'@harness-engineering/cli': minor
---

comprehension: add the `put_comprehension` MCP tool (ADR 0109, slice 2) — the agent-neutral semantic write-back seam. An agent already working a module attaches the semantic understanding it authored (`{ summary, invariants }`) onto that module's source-fresh static unit, on its own session's auth (no API token, no provider resolution). Validated in TS against the same `semanticResponseSchema` the provider path uses; refuses to enrich a missing or source-stale unit. `get_comprehension` now returns `semanticNeeded: true` when it serves a static-only unit, signaling the caller to enrich it. The write-back rejects a summary/invariant containing a top-level owned section heading (which would corrupt the static half on round-trip) and caps the payload size; malformed-payload and write-failure outcomes surface as `isError` envelopes while policy refusals (missing/stale unit) remain non-error `{ written: false }` results.
