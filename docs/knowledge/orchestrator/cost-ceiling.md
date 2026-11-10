---
type: business_rule
domain: orchestrator
tags: [cost, cost-ceiling, budget, abort, token-usage, pricing, hermes-phase-5]
phase: hermes-phase-5
---

# Per-task cost ceiling

**Phase:** Hermes Phase 5 — Dispatch Hardening
**Related ADR:** `docs/knowledge/decisions/0014-cost-ceiling-policy.md`

Phase 5 adds a per-task cost cap with abort-on-exceed. The orchestrator
tracks cumulative agent spend across turns dispatched for a single
maintenance task and aborts the next-turn dispatch when the configured
ceiling is crossed.

## Pipeline

```
Agent backend             CostCeilingMonitor                Scheduler
─────────────             ──────────────────                ─────────
runTurn() yields event   ─►  recordTurn(taskId, usage,      ─►  registers task before dispatch
  with TokenUsage             modelName) → returns                listens for 'abort'
                              cumulative costUsd
                              fires 'abort' on exceed
                              fires 'warn' at warnAtPct
                          ─►  RunResult.costUsd ← final     ─►  on 'abort':
                              cumulative                          status='failure'
                                                                  error='cost_ceiling_exceeded'
                                                                  tear down session
```

The monitor lives in
`packages/orchestrator/src/cost/cost-ceiling-monitor.ts`. It is
backend-agnostic — any caller that has a `TokenUsage` and a model name
can drive it.

## Configuration

`costCeiling` is an optional field on `TaskDefinition`:

```ts
export interface TaskCostCeiling {
  /** Hard cap in USD. Cumulative spend > maxUsd fires the abort path. */
  maxUsd: number;
  /** Warn threshold expressed as a percentage of maxUsd (1–99). */
  warnAtPct?: number;
}
```

Example in `harness.config.json`:

```json
{
  "maintenance": {
    "enabled": true,
    "tasks": {
      "arch-violations": {
        "enabled": true,
        "costCeiling": { "maxUsd": 1.5, "warnAtPct": 80 }
      }
    }
  }
}
```

Per Decision **D7** in the ADR, all four task types
(`mechanical-ai`, `pure-ai`, `report-only`, `housekeeping`) accept
`costCeiling`. Tasks that never spawn an agent simply never accumulate
cost, so the ceiling is a no-op for them — but it remains available
for forward-compat (e.g., a future report-only task that calls a paid
API).

## What "abort" actually does

Per Decision **D6**, the abort is _advisory at the turn boundary_:

1. The currently-streaming turn finishes (mid-stream cancellation is
   not guaranteed across backends).
2. The scheduler stops dispatching the _next_ turn.
3. The session is torn down.
4. `RunResult.status = 'failure'`, `error = 'cost_ceiling_exceeded'`,
   `RunResult.costUsd = <cumulative>`.

For tasks where mid-stream runaway is a real concern, pair
`costCeiling` with `maxTurns` and a tight `turnTimeoutMs`. The three
guards protect against complementary failure modes.

## Pricing and unknown models

The monitor resolves pricing via a `PricingResolver` (typically wired
to `getModelPrice` from `@harness-engineering/core`). When the resolver
returns `null`:

- `recordTurn` records **0** cost for that turn.
- A single warning is logged per (taskId, model) pair.
- The ceiling becomes a no-op for that combination rather than firing
  spurious aborts.

Operators with custom or self-hosted models should add pricing entries
to the dataset (see `packages/core/src/pricing/pricing.ts`).

## Telemetry interaction

`CostCeilingMonitor` consumes `TokenUsage` events that Phase 0 already
emits via the agent backend lifecycle. No backend has to know the
ceiling exists. When abort fires, the scheduler emits a
`agent.cost.ceiling_exceeded` telemetry event (consumed by the
existing webhook fan-out and the dashboard `/insights/cache` widget).

## Limitations

- **Turn-boundary granularity.** A single very-large turn can exceed
  the ceiling by an arbitrary amount before abort fires. Mitigation:
  small `maxTurns`, tight `turnTimeoutMs`.
- **Token spend only.** Compute-time cost on remote sandboxes (GPU
  minutes, container runtime) is not modeled. Adding compute-time
  cost is tracked as a Phase 6+ candidate.
- **Per-task only.** Phase 5 does not implement per-org or per-day
  ceilings. The same singleton monitor can be extended later — the
  pipeline already runs as a long-lived service.
