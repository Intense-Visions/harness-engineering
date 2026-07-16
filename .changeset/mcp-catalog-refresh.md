---
'@harness-engineering/cli': minor
---

Refresh the suggested MCP-server catalog to 2026 best-in-class and make it
freshness-aware. `INTEGRATION_REGISTRY` now suggests context7, playwright,
the official GitHub MCP, Exa (agent search), and harness's own MCP; the
stale perplexity / augment-code / sequential-thinking suggestions are
removed (removal only stops _suggesting_ — it never touches an installed
integration). Every entry carries a `lastReviewed` date and a
`CATALOG_LAST_REVIEWED` const; `harness doctor` emits a non-blocking advisory
when the catalog is older than 120 days so it signals its own staleness.
