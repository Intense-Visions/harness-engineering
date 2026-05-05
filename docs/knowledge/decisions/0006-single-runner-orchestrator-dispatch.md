---
number: 0006
title: Single-runner orchestrator dispatch via OrchestratorBackendFactory
date: 2026-05-05
status: accepted
tier: large
source: docs/changes/multi-backend-routing/proposal.md
---

## Context

Pre-Spec-2 the orchestrator held two `AgentRunner` fields — `this.runner` (cloud) and `this.localRunner` (local) — instantiated once per orchestrator lifetime. Dispatch chose between them with `const activeRunner = backend === 'local' && this.localRunner ? this.localRunner : this.runner;` (orchestrator.ts:1188 pre-Phase-3). The `backend` variable was a string read from `this.config.agent.backend` plus a `localBackend` override hack — a two-slot cap baked into the runtime, not just the config.

Spec 2's `agent.backends` named map (see [ADR 0005](./0005-named-backends-map.md)) made the two-runner split untenable: with N possible backends and per-tier routing, the dispatch site needed to instantiate the right backend for each issue's `useCase`, not pick from a fixed pair. Three options were considered:

1. **N runners.** Pre-instantiate one `AgentRunner` per `agent.backends.<name>`. Constant-memory but couples `start()` lifecycle to backend count and prevents per-dispatch container-wrapping decisions.
2. **Lazy runner cache.** Instantiate on first use, cache by name. Reduces eager memory but state grows over orchestrator lifetime; restart is the only eviction.
3. **Per-dispatch factory.** A single `OrchestratorBackendFactory` with `forUseCase(useCase) -> AgentBackend` constructs a fresh backend on each dispatch. Backends are short-lived (one issue's worth of work).

## Decision

The orchestrator dispatches via a single `OrchestratorBackendFactory.forUseCase(useCase: RoutingUseCase): AgentBackend`. Each call resolves the routed backend name from `BackendRouter`, looks up the `BackendDef`, and instantiates a fresh backend (wrapped in `ContainerBackend` if `agent.sandboxPolicy === 'docker'`). The dispatch site at `orchestrator.ts:1343-1344` is a single line: `const backend = this.backendFactory.forUseCase(useCaseForBackendParam(issue, backend));`. The `this.runner` / `this.localRunner` fields and the `backend === 'local'` switch are deleted.

`LocalModelResolver` instances remain long-lived — one per `type: 'local'|'pi'` entry in `agent.backends`, held in `this.localResolvers: Map<string, LocalModelResolver>`. The factory's local/pi branch passes a `getModel: () => resolver.resolveModel()` callback into the per-dispatch backend instance, so the backend reads always go through the long-lived resolver. Only the `AgentBackend` instance itself is per-dispatch.

The factory's container-wrapping logic (Docker sandbox) moves into `instantiateBackend()`, so any backend type is wrappable uniformly — pre-Spec-2, only the cloud runner was wrapped.

## Consequences

**Positive:**

- Dispatch surface is minimal: one factory call per issue, one routing decision per call. No `if (backend === 'local')` branches survive in the dispatch path (asserted by SC30: `git grep "backend === 'local'|this\.localRunner"` returns zero hits in `packages/orchestrator/src/`).
- Multiple backends scale linearly. Adding a third or fourth `agent.backends.<name>` entry costs nothing in dispatch complexity.
- Container-wrapping is uniform across backend types — a critical invariant for sandbox policy enforcement.
- The factory is testable in isolation (`tests/agent/multi-backend-dispatch.test.ts` exercises it without a full orchestrator).

**Negative:**

- Per-dispatch backend instantiation costs one allocation per issue. For cloud backends this is a zero-cost object construction; for local backends it's also negligible since the resolver (the heavy lifter) is shared. Profiling during Phase 3 confirmed no measurable overhead.
- The previous "runner identity reflects backend identity" mental model is gone. Reviewers debugging dispatch must now trace through the factory + router rather than `this.runner` vs. `this.localRunner`. Compensated by inline JSDoc on `forUseCase` and the routing-driven test names.
- The factory's `RoutingUseCase` discriminated union (`{ kind: 'tier' | 'intelligence' | 'maintenance' | 'chat' }`) becomes a public-facing type. External consumers must adapt if they previously consumed the dual-runner shape.

**Neutral:**

- State-machine semantics are unchanged. SC41 (state-machine.test.ts diff is empty) holds. Escalation rules (`alwaysHuman`, `autoExecute`) still gate dispatch independently of routing.

## Related

- [ADR 0005: Named backends map](./0005-named-backends-map.md) — the schema this dispatch model serves
- [`docs/changes/multi-backend-routing/proposal.md`](../../changes/multi-backend-routing/proposal.md) §"Backend instantiation per use case" — implementation detail
- [`docs/guides/multi-backend-routing.md`](../../guides/multi-backend-routing.md) — operator-facing routing semantics
- [Issue Routing](../orchestrator/issue-routing.md) — how `RoutingUseCase` is constructed from issue scope-tier
