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
| `diskImpactGb`  | on-disk size delta (0 placeholder until the Phase 6 scheduler computes it)               |

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

## Surfaces

- **Engine / renderer:** `@harness-engineering/local-models` — `diffPoolAgainstRanking`,
  `buildJustification`.
- **Handlers / renderer:** `@harness-engineering/orchestrator` — `onApproveModelProposal`,
  `onRejectModelProposal`, `renderModelProposal`, and the kind-aware `/api/v1/proposals/*` route.
- **CLI:** `harness models proposals | approve <id> | reject <id> --reason <text>` (the CLI takes
  **no** `local-models` dep — approve is an HTTP round-trip; list/reject go through the core store).

> Deferred to later phases: the 24h scheduler wrapper that calls the diff (Phase 6), the dedicated
> `/api/v1/local-models/*` routes + WebSocket fan-out, and wiring a live `PoolManager` into the
> approve route in production (until then the route returns `501` when `modelPool` is unconfigured)
> — all Phase 6/7.

## Related

- [ADR 0058: Generalize SkillProposalSchema into a discriminated ProposalSchema](../decisions/0058-generalize-skill-proposal-into-discriminated-proposal.md)
- [Local Model Resolution](./local-model-resolution.md) — the resolver the pool feeds.
- Spec: [`docs/changes/local-model-lifecycle-manager/proposal.md`](../../changes/local-model-lifecycle-manager/proposal.md) (Phase 5; D11, D13, F6, F7, F11).
