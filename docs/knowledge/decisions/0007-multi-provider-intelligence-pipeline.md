---
number: 0007
title: Multi-provider intelligence pipeline
date: 2026-05-05
status: accepted
tier: medium
source: docs/changes/multi-backend-routing/proposal.md
---

## Context

Pre-Spec-2 the intelligence pipeline (`packages/intelligence/src/pipeline.ts`) accepted a single `AnalysisProvider` that handled both SEL (spec enrichment) and PESL (pre-execution simulation). The pipeline overrode the model name for PESL via `intelligence.models.pesl` but reused the same provider session — a hard "1 pipeline = 1 provider" invariant. Operators couldn't run SEL on a fast cheap local model and PESL on a stronger reasoning model on a different backend.

Spec 2's `agent.routing` introduced `routing.intelligence.sel` and `routing.intelligence.pesl` as independent routing keys. When the two resolve to the same backend, today's behavior should hold (one provider, model-name override only). When they resolve to different backends, the pipeline needs distinct provider instances for each layer.

Two options were considered:

1. **Single-provider invariant + force same backend.** Validate at config load that `routing.intelligence.sel === routing.intelligence.pesl` (or only `sel` is set). Simpler runtime, but defeats the user benefit — operators want to mix.
2. **Additive per-layer provider option.** `IntelligencePipeline` constructor accepts an optional `peslProvider`. When unset (the default), `pesl` falls back to the single `provider` argument and behavior is identical to pre-Spec-2. When set, the `PeslSimulator` invokes `peslProvider` instead.

## Decision

`IntelligencePipeline`'s constructor gains an optional `peslProvider: AnalysisProvider | undefined`. The `PeslSimulator` is constructed with `options.peslProvider ?? provider` (`packages/intelligence/src/pipeline.ts:55-61`). The orchestrator's `createIntelligencePipeline` (`packages/orchestrator/src/orchestrator.ts:573+`) decides whether to build a second provider: when `routing.intelligence.pesl` resolves to a different name than `routing.intelligence.sel ?? routing.default`, it calls `createAnalysisProvider('pesl')` (orchestrator.ts:587-588) and passes the result via the new `peslProvider` option (orchestrator.ts:595). Routing-key resolution lives in the private helper `resolveRoutedBackendForIntelligence` (orchestrator.ts:666+), which reads `this.config.agent.routing` and `this.config.agent.backends` directly; `createAnalysisProvider` (orchestrator.ts:619+) delegates to it before invoking `buildAnalysisProvider`. Agent-dispatch routing goes through `BackendRouter` via `OrchestratorBackendFactory.forUseCase`, but the intelligence-layer path does not call `BackendRouter.resolveDefinition`.

Backend-type translation lives in `buildAnalysisProvider` (`packages/orchestrator/src/agent/analysis-provider-factory.ts`). Per-type resolution: `local` and `pi` build an `OpenAICompatibleAnalysisProvider` keyed off the resolver's snapshot (returns `null` + warn when the resolver is unavailable); `anthropic` builds an `AnthropicAnalysisProvider` when an API key is configured, else falls back to `ClaudeCliAnalysisProvider`; `openai` builds an `OpenAICompatibleAnalysisProvider` against the cloud base URL when an API key is configured, else returns `null` + warn; `claude` always builds a `ClaudeCliAnalysisProvider` (subscription auth via the `claude` CLI subprocess; no API key needed); `mock` and `gemini` return `null` + warn because no `AnalysisProvider` implementation exists for them (factory lines 89-110, JSDoc 70-87). The factory module is orchestrator-private — not re-exported from any barrel — to keep the public surface small (per Phase 3 INTEGRATE finding).

`intelligence.provider` explicit config still wins over `routing.intelligence.*` (preserves Phase 0–2 behavior; SC33).

## Consequences

**Positive:**

- Operators can mix providers per intelligence layer. SEL on a fast local model (cheap, low-latency enrichment), PESL on a stronger cloud model (reasoning-heavy simulation).
- The default behavior is unchanged. Existing configs that don't set `routing.intelligence.pesl` see no behavioral difference; the pipeline still runs with one provider and a model-name override for PESL.
- The provider-instantiation logic moves into a dedicated `analysis-provider-factory.ts` module. `createAnalysisProvider`'s cyclomatic complexity dropped from 33 (above the error threshold) to ≤ 5; the factory's helper carries the strategy table at warn-only complexity 13.

**Negative:**

- The "1 pipeline = 1 provider" invariant is gone. Code maintainers reading `IntelligencePipeline.ts` must check whether `peslProvider` was passed before assuming SEL and PESL share state.
- Two providers means two outbound LLM connections in the worst case. For backends that maintain HTTP keep-alive pools this is fine; for backends with limited connection budgets operators see double the connection pressure when `sel !== pesl`.
- When `routing.intelligence.pesl` resolves to a backend type without an analysis provider (`mock`), the pipeline silently falls back to the SEL provider. This is acceptable today (SC36 specifies null-fallback for unsupported types), but a future "hard-fail on unsupported PESL" mode is a candidate enhancement (carry-forward from Phase 3 INTEGRATE).

**Neutral:**

- The new `peslProvider` constructor option is additive — no public API breakage. External `IntelligencePipeline` consumers don't need to change.
- `packages/orchestrator/src/agent/analysis-provider-factory.ts` is **not** re-exported from `packages/orchestrator/src/index.ts`. It stays orchestrator-private. If a downstream consumer needs the factory, the export is a separate decision recorded in a future ADR.

## Related

- [ADR 0005: Named backends map](./0005-named-backends-map.md) — `routing.intelligence.{sel,pesl}` keys originate here
- [ADR 0006: Single-runner orchestrator dispatch](./0006-single-runner-orchestrator-dispatch.md) — sibling architectural decision; same spec
- [`docs/guides/intelligence-pipeline.md`](../../guides/intelligence-pipeline.md) — operator-facing
- [`docs/changes/multi-backend-routing/proposal.md`](../../changes/multi-backend-routing/proposal.md) §"Intelligence pipeline wiring"
