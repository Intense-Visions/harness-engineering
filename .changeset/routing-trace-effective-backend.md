---
'@harness-engineering/orchestrator': patch
'@harness-engineering/cli': patch
---

fix(routing): `harness routing trace` shows the AMR-effective backend, not the identity default

`trace --complexity <level>` displayed `decision.backendName` — the identity/default
chain pick — as the "Backend", so a `trivial` task under AMR showed `primary`/claude
even though it routes to the `fast`/local backend (the `$0` cost already reflected
local, making Backend↔cost inconsistent). The trace handler already computed the
tier-selected backend (`costedBackendName` via the same `selectCheapestQualifying`
real dispatch uses); the CLI just ignored it and the server didn't return its type.

- Server: the trace response now also carries `costedBackendType` alongside
  `costedBackendName`.
- CLI: under a `--complexity`/`--risk` dry-run, the `Backend:` line shows the
  tier-selected backend + type (what real dispatch would use), and notes when AMR
  overrides the identity pick. Non-AMR traces are unchanged.

Routing behavior itself was always correct — this is a display/observability fix so
`trace` reflects what the orchestrator actually dispatches.
