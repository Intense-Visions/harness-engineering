---
number: 0059
title: Background refresh scheduler and silent drift reconciliation
date: 2026-07-07
status: accepted
tier: medium
source: docs/changes/local-model-lifecycle-manager/proposal.md
---

## Context

LMLM Phase 5 built the model-proposal pipeline as pure, timer-free pieces: a ranker, a
`diffPoolAgainstRanking` engine, a `PoolManager`, and the kind-aware approve/reject route.
What was deferred was the thing that _drives_ them on a cadence and keeps the pool honest
against reality. Two forces motivate a background loop:

1. **Freshness.** New/better models appear upstream; the operator's pool should be
   re-ranked and swap proposals emitted without a human running a command.
2. **Drift.** An operator can `ollama rm` a model out from under the pool at any time. The
   pool's on-disk record would then claim disk budget for a model that no longer exists,
   starving future installs (S5) and misrepresenting what is loaded.

The spec's authoritative "Soundness Reconciliation (2026-07-07)" pins the cadence
(single 24h timer, ±10min jitter, ≥1h floor), the O1 structured tick log, the O4
force-refresh exit signal, and D12 silent drift reconciliation. It also flags D10/S1
("no mid-dispatch swap") as a distinct concern about the _approve/install eviction path_,
not the scheduler.

## Decision

Add a **single per-instance `RefreshScheduler`** that the orchestrator constructs and
starts when `localModels.enabled`, and stops on `Orchestrator.stop()`.

- **One timer, jittered, floored.** Each tick schedules the next via
  `Math.max(MIN_INTERVAL_MS, intervalMs) + round((random()*2-1)*jitterMs)` with
  `MIN_INTERVAL_MS = 3_600_000` (1h floor) and a 24h default. Jitter keeps a fleet from
  stampeding the HuggingFace API in lockstep. The handle is `unref()`-ed so it never keeps
  the process alive.
- **Overlap guard mirrors `LocalModelResolver.probeInFlight`.** A timer fire (or a
  `forceRefresh()`) while a tick is already running **shares the in-flight promise** rather
  than starting a second torn-state tick. This is the same single-flight pattern the local
  resolver already uses for probes.
- **Tick order (`runRefreshTick`):** detect hardware → recommend (HF popularity best-effort
  over a frozen benchmark snapshot) → **reconcile the pool against the installer (D12)** →
  diff the reconciled pool against the ranking → emit ≤1 proposal per pool entry → write the
  re-ranked scores back to pool entries. Every stage is wrapped so a failure is recorded on
  `TickResult.errors` and, where safe, later stages still run. One structured `info` O1 log
  line is emitted per completed tick.
- **Silent drift reconciliation (D12).** `PoolManager.reconcile()` treats the installer's
  `list()` as authoritative: any pool entry the installer no longer reports is removed and
  its disk budget freed (the store re-derives `diskUsedGb` from the surviving entries). The
  operator's `ollama rm` is the source of truth — the orchestrator **never auto-imports** a
  model the operator added out-of-band, and it removes silently (surfaced only through the
  pool's `onWarn` log seam, which the orchestrator maps to `logger.warn`). No proposal, no
  approval, no bus ceremony for a removal the operator already performed.
- **Force-refresh + O4 signal.** `harness models refresh` and
  `POST /api/v1/local-models/refresh` both call `forceRefresh()` (respecting the overlap
  guard). The tick threads `snapshotLoaded` / `hfReachable` from the recommender into
  `TickResult`; `isTickHardFailure` = _HF unreachable **and** no frozen snapshot loaded_.
  A hard failure maps to HTTP `503` → CLI non-zero exit; HF-down-but-snapshot-loaded is a
  soft warning (`200`, exit 0).
- **Live pool retires the 501.** The orchestrator constructs the live `PoolManager`
  (`OllamaInstallAdapter` + the loaded `PoolStateStore`) and exposes it via `getModelPool()`,
  so `kind: 'model'` approve/reject now reaches the real pool instead of the Phase 5b `501`
  stub.

**D10 / S1 ("no mid-dispatch swap") is explicitly OUT of Phase 6 scope.** The scheduler only
_emits_ proposals and reconciles operator-initiated `ollama rm` drift (entries the operator
already removed — never a model mid-dispatch). It never evicts a live model. S1's
`pendingEviction` deferral belongs to the approve/install eviction path and requires wiring
the orchestrator's per-model dispatch tracking into `PoolManager` — that is Phase 7 work.

## Consequences

- **Pool stays honest with zero operator ceremony.** `ollama rm` drift converges on the next
  tick (or force-refresh): entry removed, budget freed, `TickResult.reconciledRemoved`
  reports it, and the drift is logged (F10).
- **Force-refresh is scriptable with a real exit code.** CI/operators can `harness models
refresh` and branch on the O4 exit status; a torn HF+snapshot state fails loudly rather
  than silently emitting a stale ranking.
- **One sharp edge — candidate breadth is deferred.** Phase 2's live-HF →
  `RankerCandidate` parser (extracting `sizeB`/`quant` from HF metadata) was never built, so
  the orchestrator seeds `createNativeRecommender` with an **empty candidate set**. Drift
  reconciliation, O1 logging, dedup, score-writeback, and the whole timer/force-refresh
  surface are fully wired and exercised; autonomous discovery of brand-new HF models is the
  only piece deferred to the Phase 2 recommender completion.
- **Unattended safety preserved.** Because the scheduler never evicts a live model, deferring
  S1 is sound: nothing the loop does can pull a model out from under an in-flight dispatch.

## Alternatives rejected

- **Auto-import operator-added models.** Rejected: it makes the orchestrator fight the
  operator for control of the pool and violates D1 (pool-bounded autonomy). The operator's
  installer state is authoritative; the orchestrator reconciles _toward_ it, never past it.
- **A `setInterval` fixed cadence without jitter/overlap-guard.** Rejected: fixed intervals
  stampede the HF API across a fleet, and a slow tick overlapping the next fire would run two
  torn-state ticks against one pool. The single-flight + jitter design mirrors the proven
  `probeInFlight` resolver pattern.
- **Implementing half of S1 now.** Rejected: a partial `pendingEviction` without the
  dispatch-tracking wiring is worse than none — it implies a guarantee the system does not
  yet enforce. Documented as a Phase 7 gap instead.

## See also

- [ADR 0058: Generalize SkillProposalSchema into a discriminated ProposalSchema](./0058-generalize-skill-proposal-into-discriminated-proposal.md)
- [Model Proposal / Local Model Lifecycle](../orchestrator/local-model-lifecycle.md)
- Spec: [`docs/changes/local-model-lifecycle-manager/proposal.md`](../../changes/local-model-lifecycle-manager/proposal.md) (Phase 6; D10, D12, F10, O1, O4, S1).
