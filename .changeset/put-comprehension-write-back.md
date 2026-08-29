---
'@harness-engineering/cli': minor
---

comprehension: add the `put_comprehension` MCP tool (ADR 0109, slice 2) — the agent-neutral semantic write-back seam. An agent already working a module attaches the semantic understanding it authored (`{ summary, invariants }`) onto that module's source-fresh static unit, on its own session's auth (no API token, no provider resolution). Validated in TS against the same `semanticResponseSchema` the provider path uses; refuses to enrich a missing or source-stale unit. `get_comprehension` now returns `semanticNeeded: true` when it serves a static-only unit, signaling the caller to enrich it.
