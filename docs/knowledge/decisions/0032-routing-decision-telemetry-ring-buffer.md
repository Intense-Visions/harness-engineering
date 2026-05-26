---
number: 0032
title: Routing-decision telemetry via in-memory ring buffer
date: 2026-05-26
status: accepted
tier: medium
source: docs/changes/granular-task-routing/proposal.md
---

## Context

Routing legibility is a Spec B goal (§ Why now #3): with routing about to become significantly more configurable (per-skill + per-mode axes, fallback chains, invocation override), operators need a first-class way to inspect routing decisions before and after they happen. Without decision telemetry, granular routing is opaque — operators cannot tell what their config changes did.

Persistent storage of every routing decision would offer the richest inspection surface but introduces operational complexity (storage location, retention policy, cleanup, disk pressure) disproportionate to the v1 use case (live debugging + recent-history inspection over the last few hundred decisions).

## Decision

Every `BackendRouter.resolve()` call constructs a `RoutingDecision` record (timestamp, useCase, resolutionPath, backendName, backendType, durationMs) and emits it on the internal `RoutingDecisionBus`. The bus:

1. **Holds a per-orchestrator in-memory ring buffer** of the last N decisions (default `capacity = 500`, constructor-configurable).
2. **Re-broadcasts on the WebSocket topic `routing:decision`** for live dashboard subscribers (`/routing` panel).
3. **Emits a structured `routing-decision` log line** for orchestrator-log consumers (O1 in spec § Success Criteria).
4. **Is synchronous-but-non-throwing**: subscriber errors are caught and isolated (S6); ring-buffer push + listener fan-out never block dispatch.

The buffer is process-memory only. Orchestrator restart clears the buffer. No persistent decision history in v1.

## Consequences

**Positive:**

- Routing legibility: dashboard `/routing` panel, `harness routing trace` (dry-run), and `harness routing decisions` (recent-history dump) all read from the same source — no source-of-truth drift.
- Bounded memory: capacity bound (S5) ensures the buffer cannot grow without limit even under sustained dispatch load.
- Zero new persistence surface: no disk format, no retention policy, no migration path.

**Negative:**

- **Restart loses history.** Orchestrators that crash mid-investigation lose all decisions made before the crash. Operators investigating a flaky route should `harness routing decisions --last <N>` periodically or rely on the structured `routing-decision` log line as the durable backstop.
- **Multi-orchestrator deployments have per-instance views.** Federated or HA orchestrators each carry their own ring buffer; aggregation across instances is out of scope for v1 (spec assumption line 44). If multi-instance becomes a real use case, persistent storage is the natural next step.

**Neutral:**

- Capacity is configurable per orchestrator (e.g., for memory-constrained Pi deployments — lower; for high-throughput cloud deployments — higher). Default 500 is the spec recommendation.
- Future work (D8 follow-up): adding persistent storage is purely additive — the `RoutingDecisionBus` API contract (`emit`, `recent`, `subscribe`) survives unchanged; persistence becomes a new subscriber that writes to disk.
