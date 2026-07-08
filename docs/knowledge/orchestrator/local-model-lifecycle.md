---
type: business_concept
domain: orchestrator
tags: [local-model, lmlm, proposal, model-proposal, pool, review-queue, stale-target, dedup]
---

# Model Proposal

A **Model Proposal** is an orchestrator-generated suggestion to change the managed local-model
pool — `add`, `swap`, or `evict` — routed through the **same** hermes-phase-4 review queue that
carries skill proposals. It is the model variant of the discriminated `ProposalSchema`
(`kind: 'model'`, ADR 0058): one queue, one store, one approve/reject lifecycle, two kinds.

The Model Proposal **flows through the SkillProposalQueue** — it reuses the file-backed store
(`.harness/proposals/<id>.json`), the `/api/v1/proposals/*` routes, the event bus, and the
dashboard queue rather than standing up a parallel stack.

## Shape

`ModelProposalContent` (nested under the proposal's `model` field):

| Field           | Meaning                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- |
| `action`        | `'add' \| 'swap' \| 'evict'`                                                             |
| `target`        | `{ hfRepoId, ollamaName }` — the model to install (or evict)                             |
| `replaces?`     | `{ ollamaName }` — the pool member a `swap` displaces                                    |
| `scoreDelta`    | ranker score improvement of `target` over the replaced member                            |
| `justification` | rendered rationale (`summary`, `benchmarkBasis`, `hardwareFit`, `evidence`, `freshness`) |
| `diskImpactGb`  | real on-disk size estimate from `estimateDiskGb` (Phase 6; ranker weight sizing)         |

Model status is its own enum (`ModelProposalStatusSchema`): the base lifecycle
`open → gate-running | gate-failed → approved | rejected` **plus** the terminal
`failed_target_missing` (see Stale-target below).

## Lifecycle

```
diff → propose → (review) → approve → install → resolver pickup
                          ↘ reject → recorded (feeds dedup)
```

1. **Diff.** `diffPoolAgainstRanking()` (`packages/local-models/src/proposals/engine.ts`) — a
   pure function the Phase 6 scheduler calls each tick — compares the current pool
   (`PoolManager.snapshot()`) against the latest ranking and emits `ModelProposalContent[]`.
2. **Propose.** Each content record is justified via `buildJustification()` (from the ranked
   candidate) and persisted as a `kind: 'model'` proposal (scheduler-owned in Phase 6).
3. **Review.** Reviewers list via `harness models proposals`, inspect, and decide.
4. **Approve.** `POST /api/v1/proposals/:id/approve` is **kind-aware**: model proposals dispatch
   to `onApproveModelProposal` (`packages/orchestrator/src/proposals/model-handlers.ts`), which
   drives `PoolManager.install` (and `evict` for a swap), emits `local-models:pool`, and marks
   the proposal `approved`. Skill proposals keep the promote-to-catalog path.
5. **Resolver pickup.** Once the pool changes, `LocalModelResolver`'s pool-derived candidate list
   reflects the new member on its next probe (see [Local Model Resolution](./local-model-resolution.md)).

## Stale-target cancellation (D13 / F11)

Between proposal time and approval a `target` can disappear upstream (HF 404). The Ollama install
adapter surfaces this as `InstallResult { status: 'error', code: 'failed_target_missing' }`, and
`PoolManager.install` propagates it **without mutating pool state**. The approve handler then:

- transitions the proposal to `status: 'failed_target_missing'`,
- emits a `local-models:proposal` bus event,
- **leaves the pool unchanged.**

A later diff may raise a **fresh** proposal for a still-viable target, which again requires explicit
approval — the orchestrator never silently retries a stale install.

## Dedup (F7)

The diff engine takes `pending` and `rejected` `(target, replaces)` pairs as input and **never
re-emits** a pair that is already awaiting review or was previously rejected. Rejection is the
feeder: `onRejectModelProposal` (and the `harness models reject` CLI) record the decision so the
next diff's `rejected` set suppresses the same suggestion. Combined with F6 (at most one proposal
per pool entry per diff), the queue stays low-pressure.

## Background scheduler & refresh cadence (Phase 6)

A single per-instance **`RefreshScheduler`** (constructed by the orchestrator when
`localModels.enabled`, stopped on `Orchestrator.stop()`) drives the diff on a cadence and
keeps the pool honest against the installer. See
[ADR 0059](../decisions/0059-background-scheduler-and-silent-drift-reconciliation.md).

- **Cadence.** 24h default interval, **≥1h floor**, **±10min jitter**; the timer handle is
  `unref()`-ed. Jitter avoids a fleet stampeding the HuggingFace API in lockstep.
- **Overlap guard.** A fire (or `forceRefresh()`) while a tick is in flight **shares the
  in-flight promise** — the same single-flight pattern as `LocalModelResolver.probeInFlight`.
- **Tick order (`runRefreshTick`).** detect hardware → recommend → **reconcile pool vs.
  installer (D12)** → diff → emit ≤1 proposal/entry → write re-ranked scores back. Stage
  failures are collected on `TickResult.errors` without aborting the tick.
- **O1 log.** Each completed tick emits one structured `info` line:
  `{ tick, started, completed, durationMs, candidatesEvaluated, proposalsEmitted, errors }`.
- **Silent drift reconciliation (D12 / F10).** `PoolManager.reconcile()` treats the
  installer's `list()` as authoritative: a pool entry the installer no longer reports (an
  operator `ollama rm`) is removed and its disk budget freed (the store re-derives
  `diskUsedGb`). Removal is silent — surfaced only through the pool's `onWarn` log seam. The
  orchestrator **never auto-imports** an operator-added model.
- **Force-refresh + O4.** `harness models refresh` and `POST /api/v1/local-models/refresh`
  both call `forceRefresh()`. A tick threads `snapshotLoaded` / `hfReachable` into
  `TickResult`; a **hard failure** (HF unreachable **and** no frozen snapshot) → HTTP `503` →
  CLI non-zero exit. HF-down-but-snapshot-loaded is a soft warning (`200`, exit 0).
- **Live pool retires the 501.** The orchestrator constructs the live `PoolManager` and
  exposes it via `getModelPool()`, so `kind: 'model'` approve/reject reaches the real pool.
- **Deferred (Phase 7).** D10/S1 "no mid-dispatch swap" is out of scope — the scheduler only
  emits proposals and reconciles operator-initiated drift; it never evicts a live model.
  Autonomous discovery of brand-new HF models is also deferred (the recommender is seeded
  with an empty candidate set until Phase 2's live-HF candidate parser lands).

## Surfaces

- **Engine / renderer:** `@harness-engineering/local-models` — `diffPoolAgainstRanking`,
  `buildJustification`.
- **Handlers / renderer:** `@harness-engineering/orchestrator` — `onApproveModelProposal`,
  `onRejectModelProposal`, `renderModelProposal`, and the kind-aware `/api/v1/proposals/*` route.
- **CLI:** `harness models proposals | approve <id> | reject <id> --reason <text> | refresh` (the CLI
  takes **no** `local-models` dep — approve/refresh are HTTP round-trips; list/reject go through the
  core store). `refresh` carries the O4 exit signal (non-zero on a hard failure).
- **Scheduler / tick:** `@harness-engineering/local-models` — `RefreshScheduler`, `runRefreshTick`,
  `isTickHardFailure`, `createNativeRecommender`, `estimateDiskGb`; wired on the orchestrator via
  `getModelPool()` / `getRefreshScheduler()`.
- **Force-refresh route:** `POST /api/v1/local-models/refresh` (`manage-proposals` scope).

> Deferred to Phase 7: the remaining `/api/v1/local-models/{hardware,pool,recommendations,proposals}`
> routes + WebSocket fan-out, the live-HF → `RankerCandidate` parser (autonomous discovery), and
> D10/S1 "no mid-dispatch swap" (dispatch-tracking in the approve/install eviction path).

## Related

- [ADR 0058: Generalize SkillProposalSchema into a discriminated ProposalSchema](../decisions/0058-generalize-skill-proposal-into-discriminated-proposal.md)
- [ADR 0059: Background refresh scheduler and silent drift reconciliation](../decisions/0059-background-scheduler-and-silent-drift-reconciliation.md)
- [Local Model Resolution](./local-model-resolution.md) — the resolver the pool feeds.
- Spec: [`docs/changes/local-model-lifecycle-manager/proposal.md`](../../changes/local-model-lifecycle-manager/proposal.md) (Phases 5–6; D10, D11, D12, D13, F6, F7, F10, F11, O1, O4, S1).
