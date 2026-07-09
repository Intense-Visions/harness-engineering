# Plan: LMLM Pool Consumption Improvements

**Date:** 2026-07-09 | **Spec:** docs/changes/lmlm-pool-consumption/proposal.md | **Tasks:** 21 | **Time:** ~94 min | **Integration Tier:** large

## Goal

The pooled model used for inference reflects the current pool freshly, respects operator intent (no score-0 burial), self-corrects on runtime failure, and matches the task at hand.

## Observable Truths (Acceptance Criteria)

1. When a `local-models:pool` event fires, the resolver re-probes (installed model usable in seconds, not ≤30s).
2. When an analysis request runs, the provider uses the resolver's current model without a restart.
3. When a model is installed, its pool `currentScore` equals its ranked score, never `0`.
4. When an inference session first succeeds, `lastUsedAt` advances; a model failing N consecutive inferences is deprioritized until recovery.
5. When a coding-tagged task dispatches, the resolver selects the available pooled model with the highest coding-profile score.
6. When the resolver selects a new model, it warms it before the next dispatch.

## File Map

- MODIFY `packages/orchestrator/src/agent/local-model-resolver.ts` (event refresh, circuit-breaker, use-case-aware resolve, warming hook)
- MODIFY `packages/orchestrator/src/orchestrator.ts` (subscribe resolvers to `local-models:pool`; thread use-case)
- MODIFY `packages/orchestrator/src/agent/analysis-provider-factory.ts` + the analysis provider (`getModel()` seam)
- MODIFY `packages/local-models/src/pool/manager.ts` (`initialScore` seed, `markUsed`)
- MODIFY `packages/local-models/src/pool/types.ts` (`scoresByProfile`)
- MODIFY `packages/local-models/src/pool/provider.ts` (`poolStateToCandidates(state, profile?)`)
- MODIFY `packages/local-models/src/scheduler/refresh.ts` (per-profile score writeback)
- MODIFY `packages/local-models/src/ranker/*` (per-profile scoring)
- MODIFY `packages/orchestrator/src/proposals/model-handlers.ts`, `.../routes/v1/local-models-pool-mutation.ts`, `packages/types/src/proposals.ts` (absolute score for seeding)
- MODIFY `packages/orchestrator/src/agent/backends/local.ts` (`onModelUsed`, warming)
- MODIFY `packages/orchestrator/src/agent/orchestrator-backend-factory.ts` (thread use-case → resolve)
- CREATE `docs/knowledge/decisions/NNNN-lmlm-task-aware-selection.md` (ADR)
- MODIFY operator guide docs

## Skeleton

1. Freshness loop (~4 tasks) — _approved_
2. Score-seed (~3 tasks) — _approved_
3. Runtime feedback (~4 tasks) — _approved_
4. Task-aware selection + ADR (~6 tasks) — _approved_
5. Warming (~2 tasks) — _approved_
6. Integration: ADR + docs (~2 tasks) — _approved_

## Tasks (milestone-sequenced; TDD; `harness validate` per code task)

**Milestone 1 — Freshness loop**

- T1: `LocalModelResolver.refresh()` — debounced immediate re-probe. Test: refresh triggers probe.
- T2: Orchestrator subscribes each local/pi resolver to `local-models:pool` → `resolver.refresh()`. Test: emit event → resolver re-probes.
- T3: Add `getModel?()` seam to `OpenAICompatibleAnalysisProvider`; read at request time. Test: provider uses getModel over defaultModel.
- T4: `analysis-provider-factory` passes `getModel: () => resolver.getStatus().resolved`. Test: factory wires getModel.

**Milestone 2 — Score-seed**

- T5: `[MODIFIED]` `pool.install` seeds `currentScore` from `initialScore`. Test: installed entry carries the score.
- T6: Add absolute `targetScore` to `ModelProposalContent` (additive schema). Test: schema accepts + round-trips.
- T7: Install/approve pass the ranked score as `initialScore`. Test: install route seeds non-zero score.

**Milestone 3 — Runtime feedback**

- T8: `pool.markUsed(ollamaName)` stamps `lastUsedAt`. Test: markUsed advances lastUsedAt.
- T9: `LocalBackend` `onModelUsed` seam, called on first successful turn; orchestrator binds to `pool.markUsed`. Test: successful turn calls onModelUsed once.
- T10: Circuit-breaker overlay in resolver: N consecutive failures → deprioritize; success/cooldown clears. Test: tripped model deprioritized.
- T11: Wire backend inference failures → resolver circuit-breaker. Test: failure increments; recovery clears.

**Milestone 4 — Task-aware selection + ADR**

- T12: Ranker per-profile score API (`general`/`coding`/`reasoning`) weighting profile-relevant benchmarks. Test: profiles differ where data supports it; fall back to composite.
- T13: `scoresByProfile` on `PoolEntry` (additive). Test: schema + serialize round-trip.
- T14: `scheduler/refresh.ts` writes `scoresByProfile` in the re-score step. Test: writeback populates profiles.
- T15: `poolStateToCandidates(state, profile?)` sorts by `scoresByProfile[profile]` (fallback `currentScore`). Test: profile ordering.
- T16: `resolveModel(useCase?)` + `RoutingUseCase → profile` map; resolver picks best profile-scored loaded model. Test: coding use-case → coding best-fit.
- T17: Thread use-case through `getResolverModelFor`/backend factory to `resolveModel`. Test: dispatch passes use-case.
- T18: ADR `docs/knowledge/decisions/NNNN-lmlm-task-aware-selection.md`. **Category:** integration.

**Milestone 5 — Warming**

- T19: `warmModel(ollamaName)` via Ollama `keep_alive` (best-effort, debounced). Test: warm request issued on selection change.
- T20: Trigger warm on resolver selection change. Test: selection change → warm.

**Integration**

- T21: Operator guide docs — selection model, task-aware routing, circuit-breaker, warming. **Category:** integration.

## Change Specifications

- [ADDED] Event-driven resolver refresh; analysis lazy model; runtime circuit-breaker; per-profile pool scoring; use-case-aware selection; model warming.
- [MODIFIED] Install seeds `currentScore` from the ranked score (was `0`); `lastUsedAt` stamped on real inference (was install-time/never).
- [ADDED] `PoolEntry.scoresByProfile`, `ModelProposalContent.targetScore` (additive schema).

## Notes / Risk

- **Phase 4 depends on benchmark categorization.** If the snapshot's benchmarks aren't tagged by profile, per-profile scores collapse to the composite — the feature still ships (task-awareness degrades gracefully to score-order). Verified during T12.
- Executed milestone-by-milestone with a commit per task/phase.
