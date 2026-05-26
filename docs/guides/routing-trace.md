# Routing Trace

Operator debugging surface for routing decisions. Use this guide when a dispatch routed somewhere unexpected, or to validate a config change before it goes live.

## Overview

Spec B's granular routing introduces five sources (`invocation`, `skill`, `mode`, `tier`, `default`) and fallback chains; the resolution order is deterministic but the surface is larger than pre-Spec-B routing. The orchestrator emits a `RoutingDecision` for every dispatch (kept in a 500-entry ring buffer) and offers a dry-run path so operators can predict a decision without dispatching.

Three surfaces share one source of truth (the orchestrator's `BackendRouter` + `RoutingDecisionBus`):

- **`harness routing trace`** — dry-run a resolution for a hypothetical use case
- **`harness routing decisions`** — dump recent decisions in JSON for shell pipelines
- **Dashboard `/routing` panel** — live UI with the same data, plus per-backend volume

## `harness routing trace`

Dry-runs `BackendRouter.resolve()` for a given skill or mode without dispatching:

```bash
harness routing trace --skill harness-debugging
```

Output (human-readable):

```
Resolved backend: local-fast (type: local)
Resolution path:
  1. skill   local-fast       chosen
Duration: 0.4ms
```

With `--json` for machine consumption:

```bash
harness routing trace --skill harness-debugging --json
```

Returns the full `RoutingDecision` JSON:

```json
{
  "timestamp": "2026-05-26T17:34:21.412Z",
  "useCase": { "kind": "skill", "skillName": "harness-debugging" },
  "resolutionPath": [{ "source": "skill", "candidate": "local-fast", "outcome": "chosen" }],
  "backendName": "local-fast",
  "backendType": "local",
  "durationMs": 0.4
}
```

Trace exits non-zero if resolution would throw (e.g., `routing.default` references an unknown backend) — suitable for CI config-change validation.

### Combining skill and mode

```bash
harness routing trace --skill harness-soundness-review --mode adversarial-reviewer
```

Lets you predict per-skill and per-mode interaction without changing skill.yaml.

## `harness routing decisions`

Recent decisions from the orchestrator's ring buffer, JSON by default. Suitable for `jq` piping:

```bash
harness routing decisions --skill harness-debugging --last 10
harness routing decisions --backend local-fast --last 50 | jq '.[].timestamp'
harness routing decisions --mode adversarial-reviewer --last 100 | jq 'group_by(.backendName)'
```

The ring buffer holds up to 500 decisions per orchestrator process; the buffer clears on restart. If recent history is missing, the dispatch happened before the current orchestrator process started.

## Dashboard `/routing` panel

Four cards on the dashboard `/routing` route (also reachable at `/s/routing`):

- **Resolved Chains** — current `RoutingConfig` rendered as resolved fallback chains, with currently-chosen backend per use case
- **Recent Decisions** — last decisions from the ring buffer, filterable by skill / mode / backend; each row expands to show the full `resolutionPath`
- **Per-Backend Volume** — dispatch count + success rate over the last 24 h, per backend
- **Trace Tool** — inline form (skill + mode inputs) that POSTs to `/api/v1/routing/trace`; renders the same `RoutingDecision` shape as the CLI

The panel subscribes to the `routing:decision` WebSocket topic for live updates. When the WS is disconnected, it falls back to HTTP polling every 5 s.

## Debugging routing decisions

### Scenario 1 — typo in backend name

`routing.skills.harness-debugging` is set to `lcoal-fast` (typo). At startup, validation would catch this (hard error per spec D10), but in a chain `[lcoal-fast, claude-opus]` the dispatch falls through to `claude-opus` while leaving the typo silently. Both `harness routing trace --skill harness-debugging` and the dashboard's Recent Decisions row show the typo:

```
Resolution path:
  1. skill   lcoal-fast       unknown-backend
  2. skill   claude-opus      chosen
```

The `unknown-backend` outcome on the first chain entry is the actionable signal.

### Scenario 2 — skill not routing where expected

You configured `routing.skills.harness-debugging: local-fast` but `harness routing decisions --skill harness-debugging --last 5` shows recent dispatches all hitting `claude-opus`. Run `harness routing trace --skill harness-debugging` to see which source actually won the walk. If the trace shows `source: invocation` with `claude-opus`, an upstream `--backend` flag is overriding the per-skill route. If the trace shows `source: default`, the per-skill config didn't load — verify `harness routing config` shows `skills.harness-debugging` populated.

## See also

- [Multi-Backend Routing](./multi-backend-routing.md) — operator schema
- [Routing Resolution](../knowledge/orchestrator/routing-resolution.md) — domain knowledge
- [ADR 0030](../knowledge/decisions/0030-routing-resolution-order.md) — resolution order rationale
- [ADR 0032](../knowledge/decisions/0032-routing-decision-telemetry-ring-buffer.md) — telemetry rationale
