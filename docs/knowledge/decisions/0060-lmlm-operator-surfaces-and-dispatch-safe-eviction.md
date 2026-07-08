---
number: 0060
title: LMLM operator surfaces and dispatch-safe eviction
date: 2026-07-07
status: accepted
tier: medium
source: docs/changes/local-model-lifecycle-manager/proposal.md
---

## Context

LMLM Phase 6 reached the live pool over HTTP: `POST /api/v1/local-models/refresh`
and the kind-aware `/api/v1/proposals/:id/{approve,reject}` route already drive the
real `PoolManager`. Phase 7 finishes the operator-facing surface so the CLI, the
dashboard's Recommendations/Pool cards, and Slack all read one source of truth —
and it closes Safety invariant **S1** ("no mid-dispatch swap"), which Phase 6 left
open on the approve/install eviction path.

Two design questions surfaced while scoping the read surface, plus the S1 gap:

- **D-Q1 — is `GET /api/v1/local-models/proposals` a new route or a reuse?** The
  shared `GET /api/v1/proposals?status=open` returns **all** proposal kinds and
  forces client-side filtering; the dashboard's Recommendations card wants a
  pending, model-only feed.
- **D-Q2 — do we add local-models-scoped approve/reject routes?** The spec's route
  table lists `/api/v1/local-models/proposals/:id/{approve,reject}`, but the shared
  `/api/v1/proposals/:id/{approve,reject}` route already dispatches `kind: 'model'`
  to the live pool.
- **D10 / S1 — how is "no mid-dispatch swap" enforced?** The spec assumed "the
  orchestrator's existing dispatch tracking provides the signal." Investigation
  found this is **not literally true** for local models at request granularity:
  - `orchestrator.ts` `state.running` is a **GitHub-issue-keyed agent-run map**
    (spawned agent runs, `maxConcurrentAgents`), not a per-model inference counter.
  - `local-model-resolver.ts` has only `probeInFlight` (a single health-probe
    dedup), not request tracking.
  - The webhook `inFlight` counters are unrelated (delivery concurrency).

  There is **no per-model / per-request in-flight signal today**.

## Decision

### Additive read surface (four GET routes, bridge primitives)

Add four GETs inside the existing `handleV1LocalModelsRoute` dispatcher —
`/api/v1/local-models/{hardware,pool,recommendations,proposals}` — each returning
`503 { error: 'LMLM disabled' }` when its accessor is absent/null and `200`
otherwise. `recommendations` validates `top` (positive int) and `profile`
(`general|coding|reasoning`) with a `400` on bad input.

Register all four in `V1_BRIDGE_ROUTES` (`scope: 'read-status'`). This is
**load-bearing**: `local-models` is in `V1_WRAPPABLE`, so without a bridge entry the
`/api/v1` rewrite shim rewrites `/api/v1/local-models/hardware` →
`/api/local-models/hardware` and misroutes it to the legacy status handler.
`isV1Bridge` short-circuits the rewrite; `requiredBridgeScope` supplies the scope
for default-deny (403). This mirrors the Phase 6 `refresh` bridge entry.

### D-Q1 — `/proposals` is a NEW kind-filtered route

The model-only feed is served by a kind-scoped GET that reuses core
`listProposals(projectPath, { status: 'open', kind: 'model' })`. Low cost, cohesive
with the other four local-models GETs, and it spares every client from re-filtering
the mixed shared feed.

### D-Q2 — NO duplicate local-models approve/reject routes

We do **not** add `/api/v1/local-models/proposals/:id/{approve,reject}`. The shared
`/api/v1/proposals/:id/{approve,reject}` route already reaches the live pool
(`existing.kind === 'model'` → `onApprove/onRejectModelProposal`) with terminal-state
guards and 501/422 fallbacks. Duplicating it would split the write path across two
handlers. The Soundness Reconciliation ("routes are additive… the WS layer and
notification envelope already exist and are reused") plus the explicit "avoid
duplicate handlers" instruction override the spec's route table.

### WS + notification fan-out

The model handlers emit `local-models:proposal` and `local-models:pool` on the
orchestrator bus. `OrchestratorServer.wireEvents()` fans both to every `/ws` client
(listeners detached in `stop()`); the notification registry derives a
`local-models.proposal` envelope whose title/severity vary by `data.status`
(`created` / `rejected` / `failed_target_missing`). The scheduler's `emitProposal`
seam fires `local-models:proposal { status: 'created' }` on new-proposal creation so
the WS + sink paths light up without polling.

### D10 / S1 — dispatch-safe eviction via a conservative probe + `pendingEviction`

Enforce S1 with an **over-defer-safe** deferral behind an injectable
`isModelInUse(ollamaName)` probe:

1. **Transient overlay.** `PoolManager` owns a runtime `Set<string>` of
   `pendingEvictions`; `viewState()` overlays `pendingEviction: true` onto the
   matching entries. The flag is **never persisted** — `cloneEntry` in
   `pool/state.ts` spreads all fields, so the flag lives only on the manager's Set,
   overlaid at `viewState()` time. A crash mid-defer cannot pin a stale flag on disk.
2. **Defer on the approve path.** `onApproveModelProposal` consults the probe before
   evicting `replaces` (swap) or the target (evict-only). If in use →
   `markPendingEviction`, record the approval, emit
   `local-models:pool { phase: 'evict_deferred', deferred }`, and **do not evict**.
   The install (for swaps) has already applied, so the pool transiently holds both
   models. If idle → the eviction proceeds unchanged (pre-S1 behavior).
3. **Drain on run completion.** `Orchestrator.drainDeferredEvictions()` fires
   best-effort from `emitWorkerExit` (the run-completion path). It evicts any
   pending model the probe now reports idle, clears the flag, and emits
   `local-models:pool { phase: 'evict_completed' }`. A still-busy or failed evict
   stays pending for the next completion.
4. **Conservative production probe.** `Orchestrator.isLocalModelInUse` returns `true`
   when `state.running.size > 0` **and** the name matches a currently-resolved or
   last-detected local model (`NamedLocalModelStatus.resolved === name ||
.detected.includes(name)`). It defaults to `() => false` when LMLM is disabled or
   no probe is threaded, preserving pre-S1 behavior.

## Consequences

- **S1 is honored with a safe failure mode.** The production signal is
  **agent-run-coarse, not per-request**: `state.running` counts spawned agent runs,
  not inference calls, and it matches on the resolver's currently-/last-detected
  model. It therefore **may over-defer** — an approved swap waits until the pool is
  idle rather than risk yanking a model mid-request. Over-deferral is exactly S1's
  intent (never evict a model that might be serving a request; occasionally wait
  longer than strictly necessary). It never under-defers on the covered path.
- **Known gap (deferred).** A fine-grained per-request in-flight signal for local
  models does not exist today and is **explicitly deferred**. When per-model request
  counting lands (e.g. the resolver tracking active inference calls), swap the probe
  implementation; the deferral machinery, the `pendingEviction` overlay, and the
  drain are unchanged because they depend only on the `isModelInUse` seam.
- **One write path.** Model approve/reject stays on the shared proposals route; the
  read surface is purely additive. No handler is duplicated.
- **`pendingEviction` is view-only.** It appears on `GET /api/v1/local-models/pool`
  and the `local-models:pool` WS frames but never on persisted pool state.

## Alternatives rejected

- **Block dispatch until swap completes (synchronous evict).** Rejected: it couples
  the model-lifecycle path to the hot dispatch path and can stall agent runs. S1 asks
  us to defer the swap, not to gate dispatch.
- **Per-request inference counter now.** Rejected as out of scope: no such counter
  exists, and building request-granular tracking across the resolver + backends is a
  separate effort. The conservative agent-run-coarse probe satisfies S1 today; the
  fine-grained signal is a documented future swap-in.
- **Persist `pendingEviction`.** Rejected: a persisted flag can be orphaned by a
  crash mid-defer, pinning a model that is never drained. Keeping it transient means a
  restart simply re-evaluates on the next approve/drain.
- **Add local-models-scoped approve/reject routes (D-Q2).** Rejected: duplicates the
  live write path already served by the shared route.

## See also

- Spec: `docs/changes/local-model-lifecycle-manager/proposal.md` — F4(d), F11, S1, S7;
  Soundness Reconciliation 2026-07-07 (authoritative).
- Plan: `docs/changes/local-model-lifecycle-manager/plans/2026-07-07-phase7-http-ws-notifications-plan.md`.
- ADR 0059 — background refresh scheduler and silent drift reconciliation (the tick
  that emits the proposals this surface exposes).
- ADR 0058 — discriminated proposal (the `kind: 'model'` shape the routes filter on).
