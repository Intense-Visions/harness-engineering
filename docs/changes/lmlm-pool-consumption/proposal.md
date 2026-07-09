---
title: LMLM Pool Consumption Improvements
status: proposal
tier: large
keywords:
  - local-models
  - model-pool
  - resolver
  - task-aware-routing
  - runtime-feedback
  - model-warming
source: docs/changes/lmlm-pool-consumption/proposal.md
---

# LMLM Pool Consumption Improvements

## Overview & Goals

The Local Model Lifecycle Manager (LMLM) install side is now solid — async install with
progress, resumable pulls, restart recovery, and lineage scoring all shipped (PRs #775, #777).
But the **consumption** side — how an installed pool model is actually selected and used for
inference — is pull-based and static, so the freshly-installed model barely gets used:

- The `LocalModelResolver` only **polls** on a timer and ignores the `local-models:pool` event
  the orchestrator already emits, so a new model isn't used by agents for up to ~30s
  (`local-model-resolver.ts:260`).
- The **analysis/intelligence pipeline** bakes its model in at build time and never updates, so
  a new model is never used for analysis until a restart (`analysis-provider-factory.ts:147`).
- A fresh pool entry starts `currentScore: 0` (`pool/manager.ts`), and the resolver prefers the
  **highest-scored** loaded model (`pool/provider.ts:22`) — so the model you explicitly installed
  sits at the bottom until the next re-rank.
- `lastUsedAt` drives LRU eviction (`pool/eviction.ts`) but appears **not** to be stamped on real
  inference, so eviction runs on stale/`null` data; runtime failures never feed back into selection.
- The pool holds multiple models and the ranker knows `general`/`coding`/`reasoning` fit, but
  dispatch uses one top-scored model per backend regardless of the task.
- "Available" means _installed_, not _warm in VRAM_, so the first request after a switch cold-starts.

**Goal:** make the pool a live, task-aware, self-correcting supply of models for inference — closing
the loop between what the operator installs / the scheduler ranks and what actually serves requests.

**Strategy grounding** (`STRATEGY.md`): advances **Agent Autonomy** (the orchestrator picks the right
local model with no human config edits) and the **"Compounding feedback loops"** track (runtime
performance shapes future selection).

**Out of scope:** the install side (shipped); the ranker's core benchmark math (shipped); live
HuggingFace candidate discovery (separate roadmap row `lmlm-live-hf-candidate-discovery`).

## Decisions Made

- **D1 — Event-driven freshness.** The resolver subscribes to the `local-models:pool` bus event and
  re-probes immediately on a mutation; the periodic probe remains as a fallback safety net. Chosen
  over merely shortening the poll interval because the event is already emitted — this closes the lag
  with a fallback, rather than trading latency for probe cost.
- **D2 — Lazy analysis-model resolution.** The analysis provider gains a `getModel()` seam (mirroring
  `backends/local.ts:57`) and resolves the current model per analysis call, instead of freezing
  `defaultModel` at pipeline-build time. Chosen over rebuilding the pipeline on each pool event
  (heavy, and still stale between rebuilds).
- **D3 — Seed the install score.** A new pool entry's `currentScore` is initialized from the model's
  ranked score at install (falling back to the interpolated score), not `0`. Chosen over a user-facing
  "pin/preferred" flag — the `0` is simply uninitialized, and seeding reuses the ranker we already
  wired. Pinning is a new UX surface deferred under YAGNI.
- **D4 — Runtime feedback (capped).** `lastUsedAt` is stamped on real inference, and a lightweight
  **failure circuit-breaker** deprioritizes a model that fails N consecutive inferences until a
  cooldown or a success. A full latency-weighted runtime score feeding the ranker is explicitly
  deferred as a future item.
- **D5 — Task-aware selection via per-profile pool scoring.** Pool entries carry a score **per profile**
  (`general`/`coding`/`reasoning`), the ranker computes them, and a `RoutingUseCase → profile` map lets
  the resolver pick the best-fit _loaded_ pooled model for each task. Chosen over operator config maps
  (the manual editing we're trying to eliminate) and per-dispatch re-rank (cost + live-candidate
  dependency). This is the change that advances Agent Autonomy.
- **D6 — Warm on selection.** When the resolver's selection changes, the system warms the model
  (loads it into VRAM) via Ollama `keep_alive` / a minimal priming request, so the next dispatch is
  not a cold start.

## Technical Design

### Phase 1 — Freshness loop (D1, D2)

- **Resolver push refresh.** `LocalModelResolver` exposes a `refresh()` that triggers an immediate
  (debounced) `probe()`. The orchestrator subscribes each local/pi resolver to the `local-models:pool`
  event (`orchestrator.ts` — same emitter that already drives the WS fan-out) and calls `refresh()` on
  each frame. The periodic `probeIntervalMs` timer is unchanged (fallback).
- **Analysis lazy model.** Add an optional `getModel?: () => string | undefined` to
  `OpenAICompatibleAnalysisProvider`; when present it takes precedence over the static `defaultModel`
  and is read at request time. `analysis-provider-factory.ts` passes
  `getModel: () => resolver.getStatus().resolved ?? undefined` instead of a frozen `defaultModel`.
- **EARS:** _When a `local-models:pool` event fires, the resolver shall re-probe within one debounce
  window._ _When an analysis request runs, the provider shall use the resolver's currently-resolved
  model._

### Phase 2 — Score-seed (D3)

- Thread an `initialScore` from install into the pool entry. The operator install route already
  resolves a `RankedModel match` with `.score` (`local-models-pool-mutation.ts`) — pass it as
  `initialScore` to `pool.install`. For scheduler/approve-driven proposals, carry the target's absolute
  ranked score on `ModelProposalContent` (a small additive schema field) so `onApproveModelProposal`
  can seed it; fall back to the interpolated score when absent.
- **EARS:** _When a model is installed, the pool entry's `currentScore` shall be initialized to the
  model's ranked score, never `0`._

### Phase 3 — Runtime feedback (D4)

- **`lastUsedAt` on inference.** `LocalBackend`/`PiBackend` gain an optional
  `onModelUsed?: (ollamaName: string) => void` (wired like `getModel`), called on the first successful
  turn of a session; the orchestrator binds it to `pool.markUsed(name)` (the existing manager setter).
- **Circuit-breaker.** A transient runtime overlay (mirroring `pendingEvictions`) tracks per-model
  consecutive inference failures. At `>= N` failures a model is marked `tripped`; the resolver's
  candidate selection deprioritizes `tripped` models. A success or a cooldown window clears the trip.
  This is a runtime overlay only — never persisted, never mutates `currentScore`.
- **EARS:** _When an inference session first succeeds, the system shall stamp the pool entry's
  `lastUsedAt`._ _If a pooled model fails N consecutive inferences, the resolver shall deprioritize it
  until it succeeds or a cooldown elapses._

### Phase 4 — Task-aware selection (D5)

- **Per-profile scores.** Extend the ranker to produce a score per `profile`
  (`general`/`coding`/`reasoning`) by weighting profile-relevant benchmarks; the scheduler's
  `writeBackScores` writes a `scoresByProfile` map onto each pool entry (additive `PoolEntry` field).
  Scores the models **already in the pool** — no dependency on live HF candidate discovery.
- **Use-case → profile map.** A static mapping from `RoutingUseCase` to profile (e.g. coding-tagged
  agent runs → `coding`; analysis layers → `general`/`reasoning`). `poolStateToCandidates` gains an
  optional `profile` argument that sorts by `scoresByProfile[profile]` (falling back to `currentScore`).
- **Use-case-aware resolve.** `LocalModelResolver.resolveModel(useCase?)` selects the highest
  profile-scored _loaded_ model. `getResolverModelFor` (`orchestrator.ts:592`) and the backend factory
  thread the dispatch's use-case through so the backend's `getModel()` is profile-aware.
- **EARS:** _When a coding-tagged task dispatches, the resolver shall select the available pooled model
  with the highest coding-profile score._

### Phase 5 — Warming (D6)

- On a selection change (`resolver.resolved` transitions to a new model), issue a debounced Ollama warm
  request (`POST /api/generate` with an empty/1-token prompt and `keep_alive`) to load it into VRAM.
  Skip when already warm; best-effort (failures are logged, never block dispatch).
- **EARS:** _When the resolver selects a new model, the system shall warm it before the next dispatch
  where feasible._

### File layout (touch map)

| Area                                                    | Files                                                                                                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolver push + use-case-aware select + circuit-breaker | `orchestrator/src/agent/local-model-resolver.ts`, `orchestrator/src/orchestrator.ts` (event wiring)                                           |
| Candidate ordering by profile                           | `local-models/src/pool/provider.ts`                                                                                                           |
| Analysis lazy model                                     | `orchestrator/src/agent/analysis-provider-factory.ts`, the `OpenAICompatibleAnalysisProvider`                                                 |
| Score-seed                                              | `local-models/src/pool/manager.ts`, `orchestrator/.../local-models-pool-mutation.ts`, `proposals/model-handlers.ts`, `types/src/proposals.ts` |
| `lastUsedAt` + warming                                  | `orchestrator/src/agent/backends/local.ts` (+ `pi.ts`), `local-models/src/pool/manager.ts`                                                    |
| Per-profile ranker scores                               | `local-models/src/ranker/*`, `local-models/src/pool/types.ts` (`scoresByProfile`), `local-models/src/scheduler/refresh.ts`                    |

## Integration Points

- **Entry Points:** resolver `local-models:pool` subscription (orchestrator wiring); analysis provider
  `getModel()` seam; backend `onModelUsed` seam; `resolveModel(useCase)` signature; ranker per-profile
  scoring API; `poolStateToCandidates(state, profile?)`.
- **Registrations Required:** additive `PoolEntry.scoresByProfile` and `ModelProposalContent` absolute
  score need the pool-state / proposal Zod schemas + `local-models` barrel updated if new symbols are
  exported. Optional `harness.config.json` fields: use-case→profile overrides + a warming toggle.
- **Documentation Updates:** the LMLM operator guide (how selection works, task-aware routing, warming,
  circuit-breaker); any AGENTS.md pointer to model routing.
- **Architectural Decisions:** **D5 (task-aware selection via per-profile pool scoring)** warrants a
  standalone ADR — it introduces per-profile scoring and use-case→profile routing as a new selection
  model. The other decisions are enhancements/bug-fixes and ride in the spec.
- **Knowledge Impact:** graph concepts — "pool selection is use-case-aware," "runtime feedback loop
  (usage + failure) shapes selection," "model warming," and the `profile` taxonomy.

## Success Criteria

1. After an install completes, a subsequent agent dispatch uses the new model within one debounce
   window (no ~30s poll wait) — observable via an event → probe test.
2. The analysis pipeline uses the resolver's current model without an orchestrator restart.
3. A freshly-installed pool entry has `currentScore` equal to its ranked score, never `0`.
4. `lastUsedAt` advances on real inference; a model that fails N consecutive inferences is
   deprioritized until it recovers.
5. A coding-tagged task selects the available pooled model with the highest coding-profile score;
   a reasoning-tagged task selects the reasoning best-fit.
6. Selecting a new model issues a warm request before the next dispatch.

## Implementation Order

1. **Freshness loop** (D1, D2) — event subscription + analysis `getModel()` seam. Foundation; unblocks
   "installed model is actually used."
2. **Score-seed** (D3) — init `currentScore` from the ranked/interpolated score. Cheap, independent.
3. **Runtime feedback** (D4) — `lastUsedAt` on inference + failure circuit-breaker.
4. **Task-aware selection** (D5) — per-profile ranker scores + `scoresByProfile` + use-case→profile
   resolve. The flagship; builds on the freshness loop. Carries the ADR.
5. **Warming** (D6) — warm-on-selection polish, on top of the new selection path.
