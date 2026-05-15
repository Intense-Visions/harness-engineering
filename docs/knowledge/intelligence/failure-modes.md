---
type: business_concept
domain: intelligence
tags: [intelligence, failure, degradation, fallback, error-handling]
---

# Intelligence Failure Modes and Degradation

The intelligence pipeline is designed to fail gracefully at every level. No failure in the intelligence layer should block the orchestrator from dispatching work -- the system always falls back to a less-informed but functional path.

## Pipeline Disabled (intelligence.enabled: false)

When `intelligence.enabled` is `false` (the default), the entire pipeline is skipped. SEL, CML, and PESL never run. The orchestrator dispatches work items using its existing rule-based routing logic without any enrichment, complexity scoring, or simulation. This is the zero-cost baseline -- no LLM calls are made and no provider is instantiated.

## LLM Provider Unreachable

When the configured LLM provider is unreachable (network failure, invalid API key, provider outage, local model server down), the pipeline gracefully skips the affected layers. The orchestrator falls back to rule-based routing, dispatching based on scope tier and static configuration rather than LLM-derived signals. No error is surfaced to the end user unless explicitly configured.

## Graph Empty or Unavailable

When the knowledge graph is empty or cannot be loaded:

- **CML structural dimension** scores 0, since blast radius computation via `CascadeSimulator` requires graph nodes and edges to traverse. The structural score contributes nothing to the overall complexity score.
- **CML semantic dimension** may still function, as it derives from SEL enrichment output (unknowns, ambiguities) rather than graph data directly.
- **CML historical dimension** may still function if execution outcome nodes exist in the graph, but an empty graph means no historical data is available and this dimension also scores 0.
- **SEL graph validation** degrades -- `GraphValidator` cannot confirm affected system references against the graph, so enriched specs may contain unvalidated system names.

The net effect is that complexity scores skew lower than they should, which biases the system toward local dispatch rather than escalation. This is a safe default -- the system errs on the side of attempting work rather than blocking on missing data.

## PESL Abort Behavior

When the Pre-Execution Simulation Layer runs a full LLM simulation (for `signalGated` / guided-change tiers) and the resulting confidence score falls below 0.3, the simulation sets its `abort` flag to `true`. The orchestrator converts the pending dispatch into an `EscalateEffect`, routing the work item to a human reviewer instead of an agent.

The escalation includes the simulation's predicted failures and test gaps as context, so the human reviewer understands why the system lacked confidence. This prevents the orchestrator from dispatching work that the simulation predicts will fail.

## Failure Cache TTL

Failed analysis requests are cached for a configurable duration (`failureCacheTtlMs`), defaulting to a short TTL. During this window, subsequent requests for the same analysis skip the LLM call entirely and return the cached failure, triggering the same graceful degradation path.

This avoids hammering a broken provider with retries, which would waste time and potentially accumulate costs against a provider that is returning errors. Once the TTL expires, the next request attempts the provider again. The TTL is configurable in `harness.config.json`:

```yaml
intelligence:
  failureCacheTtlMs: 300000 # 5 minutes
```

## Tier-Based Degradation

Provider failures do not affect all scope tiers equally:

| Scope Tier    | Impact of Provider Failure                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `autoExecute` | No impact. This tier (quick-fix, diagnostic) skips SEL and CML entirely and only runs graph-only PESL checks, which do not require an LLM provider.                                                                                                                |
| `signalGated` | Full impact. This tier (guided-change) relies on SEL for enrichment, CML for complexity scoring, and PESL for full LLM simulation. Provider failure causes all three to degrade, and the orchestrator falls back to rule-based routing without enrichment context. |
| `alwaysHuman` | Partial impact. This tier always escalates to a human reviewer regardless of intelligence output. SEL enrichment normally provides context for the human reviewer; without it, the escalation proceeds but with less supporting information.                       |

The key design principle is that the lowest-risk tier (`autoExecute`) has zero LLM dependency, so basic operational tasks always proceed even during complete provider outages.
