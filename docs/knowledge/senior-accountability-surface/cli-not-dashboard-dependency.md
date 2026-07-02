---
type: business_rule
domain: senior-accountability-surface
tags: [dependency-boundary, leaf-package, signals, cli, dashboard, d6]
---

# CLI Must Not Depend on the Dashboard App (D6)

The CLI must never depend on the dashboard application. Curated repo-health
signals live in the shared leaf package `@harness-engineering/signals`, so any
consumer — including the CLI — can gather signals without transitively pulling in
`@harness-engineering/dashboard`.

This records **D6** from the spec's Decisions table
(`docs/changes/senior-accountability-surface/proposal.md`). The full ADR for D6 is
scheduled in Phase 5 (Docs + ADRs); this note lands the machine-readable graph fact
so the dependency boundary is queryable now.

## The rule

- `@harness-engineering/signals` is a **leaf package**. Its runtime dependencies are
  `@harness-engineering/graph` and `zod` only — it imports nothing from `core`,
  `orchestrator`, `intelligence`, or `dashboard`.
- The dependency edge points **dashboard → signals**, never the reverse. The
  dashboard consumes `gatherSignals` / `signalRegistry` from the package instead of
  from its former `src/server/signals/*` relative paths.
- Because signals is a clean leaf, the Phase 2 pre-merge-brief CLI command can add
  `@harness-engineering/signals` as a dependency without dragging the dashboard app
  into the CLI's dependency graph.

## Enforcement

`harness check-deps` proves there is no `signals → dashboard` edge and no new
cycles. A grep guard (`@harness-engineering/dashboard` must not appear under
`packages/signals/`) backs the same boundary. See the architecture layer-boundary
rule (`../architecture/layer-boundaries.md`) for the general layering convention.
