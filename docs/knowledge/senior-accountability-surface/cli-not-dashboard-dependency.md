---
type: business_rule
domain: senior-accountability-surface
tags: [dependency-boundary, leaf-package, signals, cli, dashboard, d6]
---

# The Signals/Brief Path Must Not Route Through the Dashboard App (D6)

Curated repo-health signals live in the shared leaf package
`@harness-engineering/signals`, so any consumer — including the CLI's
`pre-merge-brief` command — can gather signals without routing through the
dashboard application. Signal computation must never depend on
`@harness-engineering/dashboard`.

**Precise scope:** the CLI package as a whole _does_ legitimately depend on
`@harness-engineering/dashboard` (pre-existing on `main`) because the `harness
dashboard` command launches the dashboard server. D6 is therefore NOT "the CLI
must not depend on dashboard" — that edge already exists for a good reason. D6 is
the narrower, load-bearing rule that **signal computation lives in a shared leaf,
not behind the dashboard app**, so the brief can compute signals in CI without
standing up the dashboard.

This records **D6** from the spec's Decisions table
(`docs/changes/senior-accountability-surface/proposal.md`); the accepted ADR is
`docs/knowledge/decisions/0055-signals-shared-leaf-package.md`.

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
