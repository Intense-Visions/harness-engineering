---
number: 0064
title: Task-aware, self-correcting consumption of pooled local models
date: 2026-07-09
status: accepted
tier: large
source: docs/changes/lmlm-pool-consumption/proposal.md
---

## Context

LMLM's install side is fast and unattended (ADR 0062), but the **consumption** path —
how a pooled model actually reaches inference — was pull-based and static:

- The `LocalModelResolver` only polled (`probeIntervalMs` ~30s) and ignored the
  `local-models:pool` event the orchestrator already emits, so a just-installed model
  wasn't dispatched for up to a poll cycle. The analysis pipeline snapshotted its model
  once at construction and never updated — a swap wasn't consumed until a restart.
- A freshly installed pool entry started at `currentScore: 0`, and the resolver picks
  the highest-scored **loaded** model, so an explicitly-installed model sat at the
  bottom until the next re-rank ("pool member scoring 0" in a proposal).
- Runtime outcomes didn't feed back: `lastUsedAt` wasn't stamped on real inference (so
  LRU eviction ran on stale data), and a model failing every request kept being picked.
- Within a local backend the model was just the top **composite**-scored pool entry;
  the ranker computes per-benchmark data but no task profile was consulted at dispatch,
  so a coding task and a math-reasoning task got the same model.

## Decision

Make pooled-model consumption **event-driven, operator-honest, self-correcting, and
task-aware**, degrading gracefully when data is thin.

- **Event-driven freshness.** `LocalModelResolver.refresh()` debounce-re-probes on a
  `local-models:pool` mutation, and the analysis provider reads its model live per
  request (`getModel` seam) rather than snapshotting once — unless the operator pinned
  a layer model, which stays static.
- **Seed the score on install.** A model proposal carries the target's absolute
  `targetScore`; approval seeds the new pool entry's `currentScore` from it, so an
  explicitly-installed model enters at its real rank, never `0`.
- **Runtime feedback.** A completed turn stamps `lastUsedAt` (LRU) and clears a
  per-model **circuit breaker**; N consecutive inference failures deprioritize a model
  during resolution (it sinks below healthy peers but remains a last resort if it is the
  only loaded candidate) until a success or an elapsed cooldown clears it.
- **Task-aware selection.** The ranker computes `scoresByProfile`
  (`general`/`coding`/`reasoning`) by weighting only profile-relevant benchmarks; the
  scheduler writes these onto pool entries; `poolStateToCandidates(state, profile)`
  orders by the profile score; and `resolveModel(useCase)` maps the routed use-case to a
  profile (**code-editing tiers → coding, the diagnostic tier → reasoning, everything
  else → general**) and picks the best profile-scored loaded model.
- **Degrade, don't bury.** Where the data doesn't support a distinction, the feature
  collapses to the prior behavior: `scoresByProfile.general` always equals the composite;
  a profile with no relevant benchmark falls back to the composite; a pool entry without
  a profile score falls back to `currentScore`; a `general`-mapped use-case returns the
  cached composite resolution. `targetScore`, `scoresByProfile`, and the use-case
  parameter are all **additive and optional**, so older persisted proposals/pool entries
  and existing call sites keep working unchanged.

The use-case→profile map is a deliberately **conservative heuristic**, not a learned
policy. It lives in one function (`useCaseToProfile`) and is the intended extension
point as more signal becomes available (e.g. `cognitiveMode` on `skill`/`mode`
use-cases).

## Consequences

- **Positive.** A newly installed/swapped model is dispatched within seconds, at its
  real rank; a flaky model is routed around automatically and recovers on its own; a
  coding task prefers the coding specialist in the pool. LRU eviction reflects real
  usage.
- **Negative / limits.** Per-profile scores are only as good as the snapshot's benchmark
  tagging; when benchmarks aren't profile-classifiable the task-awareness silently
  degrades to composite score-order. The `tier`-based mapping assumes the routing tier
  approximates task type — a mismatched routing config would mis-map. Runtime feedback is
  a binary circuit breaker, not a full latency/quality signal into scoring (a deliberate
  scope cut — full runtime scoring is deferred). The `pi` backend wires freshness but not
  the usage/failure hooks yet (its streaming turn path is a follow-up).
- **Neutral.** Adds a small amount of per-model state to the resolver (failure counts +
  trip timestamps) and one extra map on `PoolEntry`. The circuit-breaker thresholds and
  cooldown are constants with injectable seams for tests.
