# Local Model Lifecycle Manager (Operator Guide)

## Overview

The Local Model Lifecycle Manager (LMLM) gives the orchestrator hardware-aware,
disk-budget-bounded autonomy over a pool of local models. It is **opt-in**:
`localModels.enabled` is `false` by default, and with it off, behavior is
byte-identical to today's hand-curated `LocalModelResolver`. When enabled, LMLM is
**additive** to the resolver — the resolver's candidate list is derived from pool
state (ordered by score) instead of a hand-maintained `model: [...]` array, and the
orchestrator proposes pool add/swap/evict changes through the shared review queue.

Before relying on autonomy, read [Known limitations](#known-limitations-read-before-relying-on-autonomy)
below — the autonomous swap-proposal loop is inert in production until a later phase
lands, and several surfaces are intentionally read-only in v1.

## Enabling LMLM

Add a `localModels` block to `harness.config.json`. All fields are optional except
`enabled`; the defaults below preserve safe behavior:

```yaml
localModels:
  enabled: false # opt-in; default off preserves today's behavior
  pool:
    diskBudgetGb: 100
    allowedOrgs: ['Qwen', 'deepseek-ai', 'meta-llama', 'mistralai']
    allowedFamilies: [] # empty = all families under the allowed orgs
    # eviction policy is fixed to lowest-score-LRU in v1 (D14)
  refresh:
    intervalMs: 86400000 # 24h default; minimum 3600000 (1h)
    proposalThreshold: 5 # minimum score delta to emit a proposal
    jitterMs: 600000 # ±10min jitter to avoid a fleet-wide thundering herd
  installer:
    backend: 'ollama' # "ollama" | "advisory"
    ollamaEndpoint: 'http://localhost:11434'
  hardware:
    override: # optional manual override; skips hardware detection
      platform: 'nvidia'
      vramGb: 24
      bandwidthGbps: 1008
```

Set `enabled: true` to turn LMLM on. With `installer.backend: 'ollama'`, LMLM drives an
already-running Ollama over its REST API. With `installer.backend: 'advisory'` (or any
non-Ollama backend), LMLM surfaces copy-paste install commands instead of mutating
anything — see [ADR 0062](../knowledge/decisions/0062-pool-bounded-autonomy-and-ollama-first-install.md).

## First-time pool setup

The pool starts **empty**. Grant LMLM its autonomy envelope once, up front:

- Set the disk budget: `harness models pool set-budget <GB>`
- Allow the HuggingFace orgs you trust: `harness models pool allow-org <org>`
- Optionally narrow to specific families: `harness models pool allow-family <family>`

The disk budget plus the org/family allowlist are the **only** boundary LMLM operates
within. Inside that boundary the orchestrator may pull, swap, and evict autonomously;
nothing crosses that line without an explicit proposal approval. This per-pool (not
per-model) authorization is the core of [ADR 0062](../knowledge/decisions/0062-pool-bounded-autonomy-and-ollama-first-install.md).

## What a proposal looks like

When LMLM wants to change the pool it emits a **model proposal** into the shared review
queue (the same queue that carries skill proposals — one queue, two kinds, per
[ADR 0058](../knowledge/decisions/0058-generalize-skill-proposal-into-discriminated-proposal.md)).
Each proposal carries a `justification` so you can decide without leaving the queue:

- `summary` — one-line rationale for the change
- `benchmarkBasis` — the benchmark evidence behind the score
- `hardwareFit` — how the target fits the detected hardware (VRAM, speed)
- `evidence` — the graded supporting data points
- `freshness` — the data recency (e.g. "Benchmark snapshot 2026-05-21")

A proposal is an `add`, `swap`, or `evict` against a specific pool entry, with a
`scoreDelta` and a `diskImpactGb` estimate.

## Approve / reject

Model proposals get a single approve/reject decision, from either surface:

**CLI**

- `harness models proposals` — list pending model proposals
- `harness models approve <id>` — approve (drives the install/swap/evict)
- `harness models reject <id> --reason <text>` — reject (feeds dedup so the same
  suggestion is not re-emitted)

**Dashboard**

- Open the `/s/local-models` panel. The **Recommendations** card lists pending model
  proposals; approve/reject there routes through the shared
  `POST /api/v1/proposals/:id/{approve,reject}` route (kind-aware — model proposals
  dispatch to the live `PoolManager`).
- The **Pool** card is **read-only** — see [Known limitations](#known-limitations-read-before-relying-on-autonomy).

Approving a proposal installs (or swaps/evicts) via the configured backend, updates
pool state, and the `LocalModelResolver` picks up the new member within a debounce
window (see [How pooled models are consumed](#how-pooled-models-are-consumed)), not
only on its next scheduled probe.

## How pooled models are consumed

Installing a model is only half the story — this is how a pooled model actually
reaches inference. See [ADR 0064](../knowledge/decisions/0064-lmlm-task-aware-pool-consumption.md)
for the rationale.

- **Event-driven freshness.** A pool mutation (install / swap / eviction) emits a
  `local-models:pool` event that debounce-triggers a resolver re-probe, so a
  just-installed or swapped model becomes dispatchable in **seconds**, not up to a
  full poll cycle (`localModel.probeIntervalMs`, default ~30s). The intelligence
  (analysis) pipeline reads its model **live per request**, so a swap is consumed
  without an orchestrator restart — unless you pinned a layer model
  (`intelligence.models.sel` / `.pesl`), which stays fixed by design.
- **Score seeding.** A freshly installed model enters the pool at its **real ranked
  score**, not `0`, so it is selectable immediately instead of sitting at the bottom
  until the next re-rank. (This is why an approved install no longer shows a
  "pool member scoring 0" justification.)
- **Task-aware selection.** Within a local backend, the resolver orders pooled
  candidates by a **task profile** derived from the routed use-case:
  code-editing tiers (`quick-fix`, `guided-change`, `full-exploration`) → **coding**,
  the `diagnostic` tier → **reasoning**, everything else → **general** (the composite
  score). Profiles come from the ranker weighting profile-relevant benchmarks; when
  the benchmark data can't distinguish a profile, selection **degrades gracefully to
  composite score-order**, so task-awareness never buries a well-scored model.
- **Runtime self-correction.** A completed turn stamps `lastUsedAt` (so LRU eviction
  reflects real usage) and clears a per-model **circuit breaker**. A model that fails
  several consecutive inferences is **deprioritized** — the resolver rolls to a healthy
  pooled alternative — until it succeeds again or a cooldown elapses. If the failing
  model is the _only_ one loaded, it is still used (a flaky model beats none).
- **Warming.** When the resolver's selection changes, it best-effort **warms** the new
  model into VRAM so the next dispatch isn't a cold start — via Ollama's `keep_alive` for
  the `local` backend, and via a 1-token completion for the `pi` (LM Studio /
  OpenAI-compatible) backend, which has no `keep_alive`. Warming never blocks a dispatch;
  a warm failure just means the first request pays the load cost.

Runtime feedback (usage stamping + circuit breaker) and warming apply to **both** the
`local` and `pi` backends.

## Known limitations (read before relying on autonomy)

These are current, deliberate boundaries in v1. None of them block the manual
workflow; they scope what "autonomy" means today.

1. **Autonomous proposals are inert until the Phase-2 candidate parser lands.** The
   refresh scheduler is seeded with an **empty candidate set** — the live-HuggingFace →
   `RankerCandidate` parser is not yet shipped, so in production the autonomous
   swap-proposal loop **proposes nothing**. What works today: manual `harness models`
   commands, the resolver deriving candidates from pool state, and silent drift
   reconciliation (an operator `ollama rm` is reconciled on the next tick). The
   autonomous discovery-and-propose loop is the piece still pending.
2. **The dashboard Pool card is read-only.** There is no direct install or evict from
   the UI. Mutate the pool through proposals (approve/reject) plus the `harness models`
   CLI.
3. **Eviction deferral (D10 / S1) is agent-run-coarse.** The "no mid-dispatch swap"
   guarantee waits for a fully idle window rather than tracking per-request
   granularity, so it **over-defers** — which is the safe direction (a swap waits
   longer than strictly necessary rather than interrupting a live dispatch). See
   [ADR 0060](../knowledge/decisions/0060-lmlm-operator-surfaces-and-dispatch-safe-eviction.md).

## Troubleshooting

| Symptom                                 | Cause & behavior                                                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ollama unreachable                      | Install adapter returns `installer_unavailable`; the pool is left **unchanged** and the proposal stays pending (safety invariant **S6**). Start Ollama and retry.          |
| HuggingFace unreachable                 | Ranking falls back to the frozen `snapshot.json`; a warning names the snapshot date (**S4**). Refresh returns `200`/exit 0 (soft warning), not a hard failure.             |
| Hardware detection fails                | LMLM falls back to a conservative CPU hardware profile (**S3**) and continues ranking against it. Use `hardware.override` to pin a profile explicitly.                     |
| Disk budget exceeded                    | The change is rejected at the engine layer (**S5**) before any download; raise `pool.diskBudgetGb` or evict a lower-scored member first.                                   |
| `harness models refresh` exits non-zero | HuggingFace is unreachable **and** no frozen snapshot is available — a hard failure (`503` over HTTP, non-zero CLI exit, **O4**). Restore connectivity or ship a snapshot. |

## See also

- [ADR 0061: LMLM as a standalone package with a native TS ranking port](../knowledge/decisions/0061-lmlm-package-boundary-and-native-ranking-port.md)
- [ADR 0062: Pool-bounded autonomy with Ollama-first installation](../knowledge/decisions/0062-pool-bounded-autonomy-and-ollama-first-install.md)
- [ADR 0064: Task-aware, self-correcting consumption of pooled local models](../knowledge/decisions/0064-lmlm-task-aware-pool-consumption.md)
- [ADR 0058: Generalize SkillProposalSchema into a discriminated ProposalSchema](../knowledge/decisions/0058-generalize-skill-proposal-into-discriminated-proposal.md)
- [ADR 0059: Background refresh scheduler and silent drift reconciliation](../knowledge/decisions/0059-background-scheduler-and-silent-drift-reconciliation.md)
- [ADR 0060: LMLM operator surfaces and dispatch-safe eviction](../knowledge/decisions/0060-lmlm-operator-surfaces-and-dispatch-safe-eviction.md)
- [Local Model Lifecycle](../knowledge/orchestrator/local-model-lifecycle.md) — the domain knowledge doc.
- [Multi-Backend Routing](./multi-backend-routing.md) — opting a backend into LMLM.
