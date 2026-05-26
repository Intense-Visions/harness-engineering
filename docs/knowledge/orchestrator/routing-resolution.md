---
type: business_process
domain: orchestrator
tags:
  [
    routing,
    resolution,
    fallback-chain,
    decision-bus,
    ring-buffer,
    telemetry,
    per-skill,
    per-cognitive-mode,
  ]
---

# Routing Resolution

The orchestrator's `BackendRouter.resolve()` walks a deterministic chain of routing sources to choose the backend for a single dispatch. This document describes the resolution order, fallback semantics, and the decision telemetry that captures every walk.

## Resolution Order

`BackendRouter.resolve(useCase, opts?)` tries sources in this fixed order; the first source that yields an available backend wins:

1. **Invocation override** — `opts.invocationOverride` if set (typically from `--backend <name>` CLI flag).
2. **Per-skill** — `routing.skills[useCase.skillName]` when `useCase.kind === 'skill'`.
3. **Per-cognitive-mode** — `routing.modes[useCase.cognitiveMode]` when a mode is present (either on a `kind: 'skill'` use case carrying `cognitiveMode`, or on a `kind: 'mode'` use case).
4. **Per-tier / per-intelligence-layer / per-isolation / maintenance / chat** — pre-Spec-B resolution preserved.
5. **`routing.default`** — required; throws at construction time if it names an unknown backend.

Within a source, chain entries (see Fallback Semantics below) are tried in declared order; the first chain entry whose backend exists in `agent.backends` is chosen. See [ADR 0030](../decisions/0030-routing-resolution-order.md).

## Fallback Semantics

Every routing value is `RoutingValue = string | readonly [string, ...string[]]`.

- **Scalar form** (`'claude-opus'`) — pre-Spec-B-compatible. Normalized internally to a one-element array.
- **Array form** (`['local-fast', 'claude-sonnet']`) — ordered fallback chain. Resolver walks the chain; the first entry whose name appears in `agent.backends` is chosen.

Entries that fail the existence check are recorded in `RoutingDecision.resolutionPath` with `outcome: 'unknown-backend'` for operator visibility (e.g., typos surface in the dashboard `/routing` panel without breaking the dispatch).

Fallback chains in v1 do **not** consult health signals. The first chain entry whose backend exists is attempted; if dispatch fails, the orchestrator's existing per-backend timeout / error handling takes over. Health-aware fallback skip is reserved for a future spec. See [ADR 0031](../decisions/0031-fallback-chains-shared-routing-primitive.md).

## Decision Telemetry

Every `resolve()` call constructs a `RoutingDecision`:

```ts
interface RoutingDecision {
  timestamp: string; // ISO
  useCase: RoutingUseCase;
  resolutionPath: ResolutionStep[];
  backendName: string;
  backendType: BackendDef['type'];
  durationMs: number;
}

interface ResolutionStep {
  source: 'invocation' | 'skill' | 'mode' | 'tier' | 'default';
  candidate: string;
  outcome: 'chosen' | 'unknown-backend' | 'considered';
}
```

`resolutionPath` records every chain entry considered. Only `chosen` exits the walk; `unknown-backend` and `considered` entries are preserved for telemetry. See [ADR 0032](../decisions/0032-routing-decision-telemetry-ring-buffer.md).

## Ring Buffer Behavior

`RoutingDecisionBus` holds the last N decisions in a per-orchestrator-process in-memory ring buffer:

- **Default capacity:** 500 decisions. Constructor-configurable.
- **Eviction:** oldest-first when capacity is reached (FIFO).
- **Persistence:** none in v1. Orchestrator restart clears the buffer.
- **Re-broadcast:** every emission is published on the WebSocket topic `routing:decision` for live dashboard subscribers (`/routing` panel).
- **Logging:** every emission produces a structured `routing-decision` log line for orchestrator-log consumers.
- **Subscriber isolation:** errors from subscribers are caught and logged; they never propagate to dispatch.

## Surfaces

| Surface                     | Source              | Purpose                                                  |
| --------------------------- | ------------------- | -------------------------------------------------------- |
| `harness routing trace`     | Dry-run `resolve()` | Predict what backend a given use case would route to     |
| `harness routing decisions` | Ring buffer         | Recent decisions, filterable by skill / mode / backend   |
| `harness routing config`    | Live config         | Current `RoutingConfig` plus resolved chains             |
| Dashboard `/routing` panel  | Ring buffer + WS    | Live decisions + per-backend volume + inline trace       |
| `routing-decision` log line | Orchestrator log    | Durable per-dispatch record (independent of ring buffer) |

## See also

- [Issue Routing](./issue-routing.md) — scope-tier detection, triage rules, and the broader routing context
- [Local Model Resolution](./local-model-resolution.md) — LMLM (Spec A) auto-populates model entries within each backend; routing references those backend names
- [Multi-Backend Routing](../../guides/multi-backend-routing.md) — operator-facing guide
- [Routing Trace](../../guides/routing-trace.md) — operator debugging recipes
- [ADR 0029](../decisions/0029-per-skill-and-per-mode-routing-axes.md) · [ADR 0030](../decisions/0030-routing-resolution-order.md) · [ADR 0031](../decisions/0031-fallback-chains-shared-routing-primitive.md) · [ADR 0032](../decisions/0032-routing-decision-telemetry-ring-buffer.md) · [ADR 0033](../decisions/0033-skill-authors-do-not-declare-backend-preferences.md)
