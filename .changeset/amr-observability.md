---
'@harness-engineering/orchestrator': minor
'@harness-engineering/cli': minor
'@harness-engineering/types': minor
---

AMR operator observability. Adds a live routing status surface so operators
running adaptive routing can see spend, degradation, and escalation — previously
only routing _decisions_ were inspectable.

- **`GET /api/v1/routing/status`** (`read-telemetry`) — the live operator view:
  whether AMR is active, budget **spend-vs-cap** (using the monotonic accumulator
  that actually drives the D8 clamp, not the telemetry ring sum), the coherence
  units that have climbed their escalation floor, and the active provider
  allowlist. Always 200; an inactive payload when AMR is off.
- **`harness routing status`** — renders that payload (budget bar, `DEGRADING`
  flag, escalated-unit table, allowlist).
- **`harness routing telemetry`** — renders the existing `/routing/telemetry`
  projection with a per-tier distribution and per-decision cost breakdown.

New: `AdaptiveRouter.getStatus()`, `Orchestrator.getRoutingStatus()`,
`EscalationState.climbedUnits()`, and the `RoutingStatus` / `RoutingBudgetStatus`
/ `RoutingEscalationUnit` types. Read-only; no dispatch behavior change.
