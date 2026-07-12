---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

AMR Phase 5 — orchestrator routing endpoints (closes the Shuttle mutual-deferral seam).

Adds the harness side of the routing control-plane contract so the Shuttle SaaS
control plane can push per-container policy and drain telemetry against a real
orchestrator (was mock-only):

- **`PUT /api/v1/routing/policy`** (`admin` scope) — Zod-validates a `RoutingPolicy`
  and hot-swaps the live `AdaptiveRouter` via `Orchestrator.ingestRoutingPolicy`,
  preserving accumulated `EscalationState` climbed floors across the update. An
  empty `{}` policy restores default-off. Returns 204.
- **`GET /api/v1/routing/telemetry`** (`read-telemetry` scope) — projects the
  enriched routing-decision ring into the Shuttle wire shape
  (`{ decisions, spentUsd }`, `RoutingTelemetry`/`RoutingTelemetryDecision`),
  fixing the cross-repo `RoutingDecision` mismatch that would have drained zero rows.
- **`RoutingPolicy.allowedProviders`** — new optional provider-type allowlist; wires
  the previously-dormant `selectCheapestQualifying` allowlist branch (fail-closed).

Default-off is preserved: with no policy pushed, `adaptiveRouter` stays `null` and
dispatch is byte-identical. All additive — existing routing/dispatch behavior is
unchanged.
