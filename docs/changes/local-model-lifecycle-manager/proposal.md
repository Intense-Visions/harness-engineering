# Local Model Lifecycle Manager (LMLM)

**Status:** Draft · **Tier:** Large · **Domain:** orchestrator + intelligence

**Keywords:** local-model, lifecycle-manager, ollama, huggingface, recommendation-engine, pool-bounded-autonomy, hardware-detection, proposal-lifecycle, hermes-phase-4, cost-insurance, vram-estimation, benchmark-ranking

## Overview

The orchestrator today knows _which_ local model is loaded (`LocalModelResolver` probes `/v1/models`) but cannot help the operator decide which models to install, swap them as better candidates appear, or stay ahead of shifting cloud LLM economics. The operator hand-curates `agent.backends.<name>.model: [...]` and is responsible for keeping that list good.

LMLM closes this loop. It detects the operator's hardware, ranks Hugging Face models by merged real benchmarks weighted for that hardware, manages a disk-budget-bounded pool of installed Ollama models, and proposes pool changes through the existing hermes-phase-4 review queue with a single approve/reject UX. The `LocalModelResolver`'s candidate list becomes a _consumer_ of pool state instead of a hand-edited config.

## Why now

Three pressures converge:

1. **Cost insurance.** Cloud LLM rate caps and pricing are tightening. The orchestrator's viability depends on local backends staying capable enough to absorb work the cloud can't (or shouldn't) take. Hand-curated local pools rot; LMLM keeps them current.
2. **Future-proofing.** The local model landscape moves fast (Qwen, DeepSeek, Llama generations land monthly). Operators shouldn't have to read HF Twitter to know when to swap.
3. **Autonomy ceiling.** The orchestrator already manages dispatch, routing, escalation, intelligence, and proposals. Local model lifecycle is the missing piece between "orchestrator runs jobs" and "orchestrator stays operationally healthy on its own."

## Goals

- Operator approves a **pool** (disk budget + allowed orgs/families) once. Orchestrator manages the pool from there.
- Operator receives **proposals with justification** when a new model would beat the current pool, with single approve/reject.
- `LocalModelResolver` candidate lists auto-populate from pool state; operators stop hand-editing `agent.backends.<name>.model`.
- `harness models` CLI + dashboard panel + skill-proposals queue + notification sinks all surface the same pool state and proposal lifecycle.
- Recommendations stay fresh via live HF API + algorithm port; no runtime dependency on whichllm or Python.

## Non-goals

- **Granular task→backend routing.** Per-skill/command/workflow model selection is a separate spec (Spec B). LMLM only ensures the local pool is healthy; routing into it is unchanged in this spec.
- **Managing the backend server itself.** Operator still runs Ollama/LM Studio/vLLM. LMLM talks to them, doesn't start/stop them.
- **First-class install for non-Ollama backends in v1.** LM Studio / vLLM / llama.cpp users get recommendations only; install is advisory ("run `lms get <id>`").
- **AMD/ROCm hardware detection in v1.** Deferred to v2.
- **Self-benchmarking on operator hardware.** Recommendations come from public benchmarks; v1 does not run a local eval suite.

## Assumptions

- **Runtime:** Node.js ≥ 18.x (matches monorepo baseline); orchestrator process is the host for LMLM modules.
- **Filesystem:** `~/.harness/local-models/` is writable by the orchestrator process; pool state file is atomically updated (tmp+rename).
- **Network:** Outbound HTTPS to `huggingface.co` is reachable for live refresh; failure degrades to frozen snapshot.
- **Ollama:** When `installer.backend = "ollama"`, an Ollama server is reachable at `installer.ollamaEndpoint` and accepts `/api/pull|delete|tags|show`. The orchestrator does not start or supervise the Ollama process.
- **Hardware detection privileges:** The orchestrator process can invoke `system_profiler` / `sysctl` (macOS) or `nvidia-smi` (Linux/Windows) on the host. Detection in containers without GPU passthrough falls through to CPU profile.
- **HuggingFace API stability:** The `/api/models` shape and pagination remain backward-compatible. Breaking changes are caught by the in-memory cache layer and surface as warnings.

## Decisions

| #       | Decision                                                                                                                                                                                                                                                                                                                      | Rationale                                                                                                                                                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1**  | **Pool-bounded autonomy.** Operator pre-approves disk budget + allowed HF orgs/families. Orchestrator auto-pulls, swaps, and evicts within that pool. Approval is per-pool, not per-model.                                                                                                                                    | Maximum "just works" without crossing the "arbitrary HF downloads" trust line. Operator authority remains explicit at the boundaries (budget + allowlist) where it matters.                                                                                                    |
| **D2**  | **Active proposal loop.** Orchestrator periodically (default 24h) re-ranks against current pool. When a candidate beats a current pool member by ≥ threshold, emit a proposal with justification into the hermes-phase-4 review queue. Single approve/reject.                                                                 | Future-proofs the pool without requiring operator to track the HF ecosystem manually. Reuses proven proposal infrastructure (skill-proposals queue).                                                                                                                           |
| **D3**  | **TS port of whichllm-style algorithm, not a wrapper.** Hardware detect, VRAM math, speed estimates, evidence-graded benchmark merge, recency-weighted ranking — all native TS in a new `@harness-engineering/local-models` package. Live HF API for model list + popularity.                                                 | No Python/uv runtime dependency. Stays fresh because data is live; algorithm only needs tuning when new GPU/quant categories emerge. Internal `ModelRecommender` interface keeps the door open for a wrapper if needed.                                                        |
| **D4**  | **Ollama-first install; others advisory.** First-class install/swap via Ollama REST (`/api/pull`, `/api/delete`, `/api/tags`). LM Studio / vLLM / llama.cpp users see recommendations and a copy-paste install command, no auto-install.                                                                                      | Ollama's API is the only one stable + scriptable enough for unattended use today. Matches the existing "orchestrator doesn't manage the server" invariant.                                                                                                                     |
| **D5**  | **`LocalModelResolver` consumes pool state.** Today's hand-curated `agent.backends.<name>.model: [...]` candidate list auto-populates from LMLM's pool when LMLM is enabled. Legacy hand-curated lists still work (LMLM disabled by default).                                                                                 | Existing resolver code path (probe loop, status surface, named-backends map) is reused unchanged. LMLM is additive, not a rewrite.                                                                                                                                             |
| **D6**  | **All four surfaces in v1.** Skill-proposals queue entries + `harness models {...}` CLI + dashboard panel + notification sinks. Single source of truth (the pool state) feeds all four.                                                                                                                                       | Operator population is split across headless (CLI), interactive (dashboard), and event-driven (Slack) modes. Picking one would block the others.                                                                                                                               |
| **D7**  | **Apple Silicon + NVIDIA + CPU in v1; AMD/ROCm in v2.** Hardware detection covers `system_profiler`/`sysctl` (macOS), `nvidia-smi` (Linux/Windows with NVIDIA), and `os.cpus()`/`os.totalmem()` (CPU fallback).                                                                                                               | Matches the dominant harness-operator hardware. AMD population is small and adds a third platform-specific code path; defer until demand is real.                                                                                                                              |
| **D8**  | **Live HF API + frozen fallback.** Online refresh fetches from HuggingFace API (model list, downloads, likes). A small frozen snapshot ships with the package for offline / rate-limited environments.                                                                                                                        | "Stays fresh" without requiring the operator to be online for every refresh. Snapshot acts as graceful degradation.                                                                                                                                                            |
| **D9**  | **Background scheduler with configurable cadence.** Default 24h re-rank; operator can override (`localModels.refresh.intervalMs`). Refresh also runs on orchestrator start and on demand.                                                                                                                                     | Without a scheduler, "autonomous future-proofing" is a lie — operator would still poke the system manually. 24h is the floor where HF popularity shifts become meaningful.                                                                                                     |
| **D10** | **No mid-dispatch swaps.** When an approved swap is pending and the model being evicted is in-flight, swap is deferred until the model has zero active dispatches.                                                                                                                                                            | Swapping a model mid-request breaks the request. Pool changes wait for natural idle windows; orchestrator's existing dispatch tracking provides the signal.                                                                                                                    |
| **D11** | **Generalize `SkillProposalSchema` into discriminated `ProposalSchema`.** Refactor `packages/types/src/proposals.ts` to introduce a base `ProposalSchema` with `proposalKind: 'skill' \| 'model'` discriminator over a content union. Existing skill proposals migrate transparently (`proposalKind: 'skill'` added on read). | The current schema is closed to skill content. Without generalization, model proposals can't share the queue's storage, dashboard, CLI, and notification mechanics. Discriminated union also unlocks future proposal kinds (config, plan refinement) without further refactor. |
| **D12** | **Silent drift reconciliation.** On each refresh, scheduler diffs `ollama tags` against pool state; entries missing from Ollama are removed from pool (budget freed); entries present in Ollama but absent from pool are not auto-imported. Logged at `info`.                                                                 | Operator's manual `ollama rm` is treated as authoritative. Silent reconciliation matches "just works" while keeping pool state aligned to the truth on disk. Auto-importing would cross the autonomy boundary (D1).                                                            |
| **D13** | **Stale-target cancellation, no auto-substitution.** When installer encounters HF 404 / rename, proposal is marked `failed_target_missing` and the next refresh produces a fresh proposal against current HF state. Operator approves the new proposal explicitly.                                                            | Preserves the explicit-approval invariant (operator approved repo A, must explicitly approve repo B). Avoids surprising the operator with a different model than they sanctioned.                                                                                              |
| **D14** | **Hardcode lowest-score-LRU eviction; remove enum.** Config drops `evictionPolicy`; a single policy ships in v1. Add an enum back only when a second policy has a concrete use case.                                                                                                                                          | YAGNI: a one-value enum is flexibility without a consumer. The policy is internal to `pool/eviction.ts`.                                                                                                                                                                       |

## Technical Design

### Package layout

```
packages/local-models/
  src/
    hardware/
      detector.ts            # platform dispatch (macos | nvidia | cpu)
      macos.ts               # system_profiler SPDisplaysDataType + sysctl
      nvidia.ts              # nvidia-smi --query-gpu=...
      cpu.ts                 # os.cpus(), os.totalmem(), bandwidth heuristics
      types.ts               # HardwareProfile
    ranker/
      algorithm.ts           # core scoring: vram + speed + benchmark + evidence
      vram.ts                # weights + GQA KV cache + activation + overhead
      speed.ts               # bandwidth-bound t/s estimate per quant/backend
      evidence.ts            # direct|variant|base|interpolated|self-reported grading
      recency.ts             # lineage-aware demotion of stale leaderboards
      benchmarks/
        sources.ts           # adapters: open-llm-leaderboard, livebench, etc.
        merge.ts             # cross-source weighting + confidence
        snapshot.json        # frozen offline fallback
    huggingface/
      client.ts              # HF API: list-models, model metadata, downloads/likes
      cache.ts               # in-memory + on-disk cache with TTL
    installer/
      interface.ts           # InstallAdapter
      ollama.ts              # /api/pull, /api/delete, /api/tags, /api/show
      advisory.ts            # returns copy-paste commands for non-Ollama backends
    pool/
      manager.ts             # pool state + eviction + capacity tracking
      eviction.ts            # policy: lowest-score-LRU
      state.ts               # on-disk pool state (~/.harness/local-models/pool.json)
    proposals/
      engine.ts              # diff current pool vs latest ranking, emit proposals
      justification.ts       # render human-readable rationale per proposal
    scheduler/
      refresh.ts             # background interval, jitter, overlap guard
    recommender/
      interface.ts           # ModelRecommender (allows future whichllm wrapper)
      native.ts              # default impl wiring ranker + huggingface + hardware
    index.ts                 # public API surface
  package.json
  tsconfig.json
```

### Core types

```ts
interface HardwareProfile {
  platform: 'macos' | 'nvidia' | 'cpu';
  vramGb: number; // unified for Apple Silicon
  ramGb: number;
  bandwidthGbps: number; // memory bandwidth
  gpuName?: string;
  cpuName: string;
  detectedAt: string; // ISO; cached for refreshIntervalMs
}

interface RankedModel {
  hfRepoId: string; // "Qwen/Qwen3-32B-GGUF"
  ollamaName?: string; // "qwen3:32b" if known mapping exists
  sizeB: number; // params in billions; total params for MoE
  activeB?: number; // MoE active params
  quant: string; // "Q4_K_M" | "Q5_K_M" | "FP16" | ...
  estimatedVramGb: number;
  estimatedTokPerSec: number;
  speedConfidence: 'high' | 'medium' | 'low';
  score: number; // 0-100
  evidence: 'direct' | 'variant' | 'base' | 'interpolated' | 'self-reported';
  benchmarkSnapshot: string; // ISO date of benchmark data used
  fitsHardware: boolean;
}

interface PoolEntry {
  ollamaName: string;
  hfRepoId: string;
  sizeOnDiskGb: number;
  installedAt: string;
  lastUsedAt: string | null;
  currentScore: number; // most-recent ranking score
}

interface PoolState {
  diskBudgetGb: number;
  diskUsedGb: number;
  entries: PoolEntry[];
  allowedOrgs: string[]; // ["Qwen", "deepseek-ai", "meta-llama"]
  allowedFamilies: string[]; // ["qwen3", "deepseek-r1", "llama-3"]
  lastRefreshAt: string | null;
}

interface ModelProposal {
  id: string;
  type: 'add' | 'swap' | 'evict';
  target: { hfRepoId: string; ollamaName: string };
  replaces?: { ollamaName: string };
  scoreDelta: number; // beats current by this much
  justification: {
    summary: string; // 1-sentence operator-facing
    benchmarkBasis: string[]; // ["LiveBench: 78.2 vs current 71.4", ...]
    hardwareFit: string; // "27GB VRAM est; you have 32GB"
    evidence: RankedModel['evidence'];
    freshness: string; // "Benchmark snapshot 2026-05-21"
  };
  diskImpactGb: number;
  proposedAt: string;
}
```

### Config schema (additions to `harness.config.json`)

```yaml
localModels:
  enabled: false # opt-in; default off preserves today's behavior
  pool:
    diskBudgetGb: 100
    allowedOrgs: ['Qwen', 'deepseek-ai', 'meta-llama', 'mistralai']
    allowedFamilies: [] # empty = all under allowed orgs
    # eviction policy is fixed to lowest-score-LRU in v1 (D14)
  refresh:
    intervalMs: 86400000 # 24h default; minimum 3600000 (1h)
    proposalThreshold: 5 # min score delta to emit a proposal
    jitterMs: 600000 # ±10min jitter to avoid thundering herd
  installer:
    backend: 'ollama' # "ollama" | "advisory"
    ollamaEndpoint: 'http://localhost:11434'
  hardware:
    override: # optional manual override; skips detection
      platform: 'nvidia'
      vramGb: 24
      bandwidthGbps: 1008
```

### HTTP routes (added to orchestrator HTTP server)

| Method   | Path                                                        | Returns                                       |
| -------- | ----------------------------------------------------------- | --------------------------------------------- | ---------- | --------------- |
| GET      | `/api/v1/local-models/hardware`                             | Current `HardwareProfile`                     |
| GET      | `/api/v1/local-models/pool`                                 | `PoolState`                                   |
| GET      | `/api/v1/local-models/recommendations?top=N&profile=general | coding                                        | reasoning` | `RankedModel[]` |
| GET      | `/api/v1/local-models/proposals`                            | `ModelProposal[]` (pending)                   |
| POST     | `/api/v1/local-models/proposals/:id/{approve,reject}`       | mutates pool                                  |
| POST     | `/api/v1/local-models/refresh`                              | force-refresh ranking; returns new proposals  |
| WS topic | `local-models:proposal`                                     | broadcasts new proposals to dashboard + sinks |
| WS topic | `local-models:pool`                                         | broadcasts pool state changes (install/evict) |

### CLI surface

```
harness models status                       # hardware + pool + last refresh
harness models suggest [--top 10] [--profile coding] [--json]
harness models pool {show,set-budget,allow-org,allow-family}
harness models proposals                    # list pending
harness models approve <proposal-id>
harness models reject <proposal-id>
harness models install <ollama-name>        # operator-initiated, must be in allowlist
harness models evict <ollama-name>
harness models refresh                      # force re-rank
```

### Dashboard panel

New route `/local-models` in `packages/dashboard`. Three cards:

- **Hardware** — detected profile + override status
- **Pool** — entries, disk usage vs budget, install/evict actions
- **Recommendations** — top N for current hardware + active proposals with approve/reject buttons

Subscribes to `local-models:proposal` and `local-models:pool` WS topics for live updates.

### Integration with `LocalModelResolver`

When `localModels.enabled = true`, the resolver constructor reads the pool state instead of `agent.backends.<name>.model: [...]`. The candidate list becomes `poolState.entries.map(e => e.ollamaName)`, ordered by `currentScore` descending. Probe loop, status surface, named-backends map all unchanged.

When `localModels.enabled = false`, behavior is identical to today (hand-curated `model: [...]`). No migration required.

### Proposal lifecycle (reuses hermes-phase-4)

A proposal is a record in the existing skill-proposals review queue with `proposalType: 'model'`. The queue already handles: persistence, dedup, multi-channel notification, approve/reject CLI + dashboard UX. LMLM contributes:

- A `ModelProposalRenderer` that turns `ModelProposal` justification into the queue's display format
- An `onApprove(proposal)` handler that triggers the installer + pool update
- An `onReject(proposal)` handler that records the decision so the proposal isn't re-emitted on the next refresh

### Background scheduler

A single interval timer per orchestrator instance. On tick:

1. Refresh hardware profile (cached for the day; re-detect only if stale)
2. Fetch latest HF model list + popularity (cache TTL 24h, falls back to frozen snapshot on failure)
3. **Reconcile pool against Ollama (D12).** Fetch `ollama tags`. For each pool entry whose `ollamaName` is not in the Ollama response, remove the entry from pool state and free its disk budget. Log each reconciliation at `info`. Entries present in Ollama but absent from pool are left alone (not auto-imported).
4. Run ranker against current hardware
5. Diff ranking vs pool: for each pool entry, find best non-pool candidate that beats it by ≥ `proposalThreshold`
6. For each diff that exceeds threshold and isn't already a pending/rejected proposal, emit a new `ModelProposal`

Overlap guard: if a refresh is in flight when the interval fires, the second fire is suppressed (same pattern as `LocalModelResolver` probe loop).

### Stale-target handling (D13)

When the installer invokes `/api/pull` for an approved proposal and HF returns 404 (repo deleted or renamed), the proposal is transitioned to status `failed_target_missing` and a `local-models:proposal` WS event is broadcast. Pool state is unchanged. The next scheduler tick re-ranks against current HF state; if a viable candidate still exists for the same role, a fresh proposal is emitted that the operator must explicitly approve. The system never substitutes an unapproved repo for an approved one.

## Integration Points

### Entry Points

New entry points created by this spec:

- **New CLI command group**: `harness models {status,suggest,pool,proposals,approve,reject,install,evict,refresh}` — registered in `packages/cli/src/commands/`
- **New HTTP routes**: `/api/v1/local-models/{hardware,pool,recommendations,proposals,refresh}` — registered in `packages/orchestrator/src/server/routes.ts`
- **New WebSocket topics**: `local-models:proposal`, `local-models:pool` — registered in the orchestrator's WS broadcast layer
- **New dashboard route**: `/local-models` in `packages/dashboard/src/routes/`
- **New npm package barrel**: `@harness-engineering/local-models` — public exports for `HardwareDetector`, `ModelRanker`, `PoolManager`, `ProposalEngine`, `ModelRecommender` interface

Touched entry points:

- **`LocalModelResolver` constructor** — gains a `poolState?: PoolStateProvider` parameter. When provided, candidate list is derived from pool state instead of static config.
- **Orchestrator startup** — initializes `LocalModelsModule` when `localModels.enabled = true`, starts the background scheduler, registers proposal handlers
- **`harness.config.json` schema** — gains `localModels` block; schema validator updated accordingly
- **`packages/types/src/proposals.ts`** — `SkillProposalSchema` refactored into discriminated `ProposalSchema` (D11, Phase 5a). Backward-compatible via default `proposalKind: 'skill'` on read for pre-refactor records.
- **Skill-proposal queue consumers** (storage, dashboard panel, CLI) — updated to accept the generalized type. No behavior change for existing skill proposals (N3).

### Registrations Required

- **Barrel export regeneration**: `pnpm generate:barrels` to publish `@harness-engineering/local-models` exports
- **Plugin generator regeneration**: `pnpm generate:plugin:all` so the new `harness models` commands appear in Claude/Cursor/Gemini/Codex plugin manifests
- **Skill-proposals queue**: register `proposalType: 'model'` with its `ModelProposalRenderer`, `onApprove`, `onReject` handlers
- **HTTP route registry**: register the five new routes in the orchestrator's route table
- **WS topic registry**: register `local-models:proposal` and `local-models:pool` broadcast channels
- **Dashboard route table**: register `/local-models` view
- **`harness.config.json` schema**: extend the JSON schema in `packages/types/src/config/` to include `LocalModelsConfig`
- **Workspace registration**: add `packages/local-models` to `pnpm-workspace.yaml`; add to turbo pipeline (`turbo.json`)

### Documentation Updates

- **AGENTS.md** — new "Local Model Lifecycle Manager" section under the orchestrator domain, documenting the pool model and proposal lifecycle
- **`docs/knowledge/orchestrator/local-model-resolution.md`** — update "Configuration" section to document the `poolState` integration; add cross-link to LMLM
- **`docs/knowledge/intelligence/provider-architecture.md`** — note that the per-layer model overrides (`intelligence.models.sel|pesl`) can now reference pool-managed models
- **NEW `docs/knowledge/orchestrator/local-model-lifecycle.md`** — domain knowledge for LMLM (pool semantics, proposal lifecycle, refresh cadence, eviction policy)
- **NEW `docs/guides/local-model-lifecycle.md`** — operator guide (pool setup, first-time approval, what proposals look like, troubleshooting)
- **`docs/guides/multi-backend-routing.md`** — add a section noting that backends of `type: local | pi` can opt into LMLM by setting `localModels.enabled = true`
- **README.md** — single sentence + link in the orchestrator capabilities section
- **CHANGELOG.md** — feature entry for the next release

### Architectural Decisions

New ADRs to author (numbers sequential after current latest):

- **ADR-NNNN: LMLM as a separate package, not orchestrator-internal** — rationale: reusability from CLI + dashboard + future standalone use; clean layer boundary; ranker is independently testable
- **ADR-NNNN+1: TS port of ranking algorithm, not whichllm wrapper** — rationale: no Python runtime dep; freshness is achievable via live HF API + algorithm stability; `ModelRecommender` interface preserves the wrap-later option
- **ADR-NNNN+2: Ollama-first install; others advisory** — rationale: Ollama is the only local backend with a stable, scriptable management API today; matches existing "orchestrator doesn't manage the server" invariant; advisory mode covers the rest non-disruptively
- **ADR-NNNN+3: Pool-bounded autonomy with proposal loop** — rationale: maximum "just works" without crossing the trust line; reuses generalized proposal infrastructure
- **ADR-NNNN+4: Generalize SkillProposalSchema into discriminated ProposalSchema** — rationale: the closed `proposalKind: 'new-skill' | 'refinement'` enum forced LMLM to either duplicate queue infra or refactor; discriminated union also unlocks future kinds (config, plan refinement); backward-compatible via default `proposalKind: 'skill'` on read
- **ADR-NNNN+5: Silent drift reconciliation, no auto-import** — rationale: operator's manual `ollama rm` is authoritative; auto-importing into pool would cross the autonomy boundary (D1); silent removal keeps "just works" without surprises
- **ADR-NNNN+6: Stale-target cancellation, no auto-substitution** — rationale: preserves explicit-approval invariant (approved repo A must not silently become repo B); operator always sees what they sanctioned

### Knowledge Impact

Concepts entering the knowledge graph:

- **`business_concept`: Local Model Pool** — operator-bounded set of installed local models with disk budget + org/family allowlist
- **`business_concept`: Model Proposal** — orchestrator-generated suggestion to add/swap/evict a pool member, routed through hermes-phase-4 review queue
- **`business_process`: Model Recommendation Lifecycle** — hardware detect → HF fetch → rank → diff vs pool → propose → approve → install → resolver picks up
- **`business_rule`: Pool Autonomy Boundary** — orchestrator MUST NOT install models outside the pool's org/family allowlist or exceed disk budget without an approved proposal
- **`business_rule`: No Mid-Dispatch Swap** — pool changes that evict an in-flight model defer until the model has zero active dispatches

Relationships:

- `LocalModelResolver` _consumes_ `LocalModelPool` (new edge)
- `ModelProposal` _flows through_ `SkillProposalQueue` (reuse edge type)
- `LocalModelsConfig` _extends_ `HarnessConfig` (new edge)

## Success Criteria

### Functional

- **F1** — `harness models status` on a Mac with Apple Silicon returns a populated `HardwareProfile` (platform, vramGb, ramGb, bandwidthGbps, gpuName) within 2 seconds without prompting the operator
- **F2** — `harness models status` on a Linux box with an NVIDIA GPU returns a populated profile derived from `nvidia-smi`
- **F3** — `harness models suggest --top 5` returns 5 ranked candidates that all `fitsHardware: true`, with `score`, `evidence`, and `benchmarkSnapshot` populated
- **F4** — Setting `localModels.enabled = true` with an empty pool and approving a proposal results in: (a) `ollama pull` is invoked, (b) pool state updates after pull completes, (c) `LocalModelResolver.detected` includes the new model on its next probe, (d) WS topic `local-models:pool` broadcasts the change
- **F5** — Pool eviction triggered by an approved swap whose target exceeds disk budget invokes `ollama delete` on the evicted model and updates pool state before the new pull starts
- **F6** — Background scheduler firing 24h after orchestrator start re-ranks and emits at most one proposal per pool entry that has a viable swap-in beating it by ≥ `proposalThreshold`
- **F7** — A proposal rejected via `harness models reject <id>` (or dashboard) is _not_ re-emitted on the next refresh cycle for the same `(target, replaces)` pair
- **F8** — A pull/install attempt for a model whose org is not in `allowedOrgs` returns an authorization error and does not invoke `ollama pull`
- **F9** — With `localModels.enabled = false` (default), no LMLM code paths execute; `harness models *` commands print "LMLM disabled; enable via `harness.config.json`"; orchestrator behavior is byte-identical to today's
- **F10** — Drift reconciliation (D12): when `ollama tags` no longer lists a pool entry, the next refresh removes the entry from pool state, frees its disk budget, and logs a structured `info` event. Verified by integration test that installs a model, removes it via `ollama rm`, triggers refresh, and observes pool state convergence.
- **F11** — Stale-target handling (D13): when installer receives HF 404 for an approved proposal, proposal status transitions to `failed_target_missing`, `local-models:proposal` event is broadcast, pool state is unchanged. The subsequent refresh re-ranks and may emit a fresh proposal that requires explicit approval.

### Safety / Invariants

- **S1** — An evict that targets a model with an active in-flight dispatch is deferred (pool state shows `pendingEviction: true`) until the dispatch completes. Verified by integration test that pulls a model, starts a fake long-running dispatch, approves a swap, and observes the deferral.
- **S2** — Probe loop and pool-state read are race-free: pool mutation never produces a moment where `LocalModelResolver.configured` references a model that no longer exists on disk
- **S3** — Hardware detection failure (e.g., `nvidia-smi` not installed on a Linux box) falls through to CPU profile rather than throwing; surfaced as a warning in `status`
- **S4** — HF API failure (network error, rate limit, 5xx) falls through to the frozen snapshot; surfaced as a warning in `status` with the snapshot's date
- **S5** — Disk budget enforcement is hard: an approved proposal that would exceed budget without eviction is rejected at the engine layer with `"would exceed disk budget by X GB"`, never trusted to the installer
- **S6** — When Ollama is unreachable, `harness models install/evict/approve` return a structured error (`code: "installer_unavailable"`); pool state is not mutated; the proposal remains pending until Ollama recovers
- **S7** — When `ollama pull` fails mid-stream (disk full, network drop, kill signal), the partial download is cleaned up via `ollama delete` and pool state reflects no change; failure is surfaced via `local-models:pool` WS event with `phase: "install_failed"`

### Quality / Recommendation Trust

- **Q1** — Top-1 recommendation for an Apple M3 Max with 36GB unified memory matches the model family recorded in `packages/local-models/tests/parity/m3-max-36gb.json` (a frozen reference output generated from whichllm at v1.0 release; refreshed manually each v1.x release). CI does not run whichllm.
- **Q2** — Top-1 recommendation for an RTX 4090 (24GB) matches `packages/local-models/tests/parity/rtx-4090-24gb.json` (same parity-fixture mechanism as Q1)
- **Q3** — Recommendations exclude models that wouldn't fit hardware: no `fitsHardware: true` entries that have `estimatedVramGb > hardware.vramGb`
- **Q4** — Self-reported / interpolated evidence models are ranked below direct-evidence models of equivalent benchmark score (verified by unit test on the merge algorithm)
- **Q5** — Stale benchmarks (older than 12 months from snapshot date) receive recency demotion (verified by unit test on the recency module)

### Operability

- **O1** — Background refresh tick logs structured entries: `{tick, started, completed, durationMs, candidatesEvaluated, proposalsEmitted, errors}` — visible in orchestrator logs
- **O2** — Pool state file (`~/.harness/local-models/pool.json`) is atomically written (tmp+rename) so a crash mid-write cannot corrupt it
- **O3** — Dashboard panel renders without errors when pool is empty, when HF is unreachable, when no hardware is detected (covered by component tests with each fixture)
- **O4** — `harness models refresh` exit code is non-zero on hard failure (HF unreachable AND no snapshot loaded); zero with warnings otherwise

### Non-regression

- **N1** — All existing `LocalModelResolver` tests pass unchanged
- **N2** — All existing `agent.backends` / `agent.routing` tests pass unchanged
- **N3** — Skill-proposals queue's existing `proposalType: 'skill'` flow is unaffected by the addition of `proposalType: 'model'`
- **N4** — `harness validate` passes on a config with `localModels` absent (legacy config compatibility)

## Implementation Order

High-level phases. Detailed task breakdown belongs to the planning skill (harness-planning), not this spec.

### Phase 0 — Scaffolding (≈ 2 days)

Goal: empty `@harness-engineering/local-models` package wired into the monorepo with no business logic.

- Create `packages/local-models/` with `package.json`, `tsconfig.json`, vitest config
- Register in `pnpm-workspace.yaml` and `turbo.json` pipeline
- Empty barrel `index.ts` + smoke test
- Wire into `packages/cli` and `packages/orchestrator` workspace deps (no imports yet)
- Stub `LocalModelsConfig` type in `packages/types`; extend `harness.config.json` schema with `localModels` block (optional, defaults preserve current behavior)

Checkpoint: `pnpm build && pnpm test && pnpm typecheck` green; `harness validate` passes on a legacy config (N4 from success criteria).

### Phase 1 — Hardware detection (≈ 3 days)

Goal: `HardwareDetector.detect()` returns a valid `HardwareProfile` on macOS Apple Silicon, NVIDIA Linux, and CPU-only.

- `hardware/macos.ts` (system_profiler + sysctl; unified memory math)
- `hardware/nvidia.ts` (nvidia-smi parser; VRAM, bandwidth, name)
- `hardware/cpu.ts` (os.cpus / totalmem; bandwidth heuristic per CPU family)
- `hardware/detector.ts` (platform dispatch + override path + caching)
- Fixture-based tests per platform; mock shell-outs

Checkpoint: F1 + F2 + S3 pass. `harness models status` (gated behind a temporary CLI flag) prints a profile.

### Phase 2 — Ranker + HF client + frozen snapshot (≈ 6-8 days)

Goal: `ModelRanker.rank(hardware, options)` returns `RankedModel[]` from live HF data, with frozen-snapshot fallback. The biggest single phase — the algorithm port.

- `huggingface/client.ts` + in-memory + on-disk cache (TTL 24h)
- `ranker/vram.ts` — weights + GQA KV cache + activation + overhead math
- `ranker/speed.ts` — bandwidth-bound t/s with per-quant + per-backend factors + MoE active/total + unified-vs-PCIe partial-offload
- `ranker/evidence.ts` — grade direct / variant / base / interpolated / self-reported with confidence multipliers
- `ranker/recency.ts` — lineage-aware demotion for stale leaderboards
- `ranker/benchmarks/sources.ts` — initial sources: Open LLM Leaderboard + HF popularity. (LiveBench / AA / Aider / Arena ELO added in v1.1.)
- `ranker/benchmarks/merge.ts` — cross-source weighting
- `ranker/benchmarks/snapshot.json` — frozen offline fallback (committed to repo, refreshed via a separate maintenance task)
- `ranker/algorithm.ts` — orchestrates the above into `RankedModel`
- Parity tests against whichllm reference outputs for at least 3 hardware fixtures (Q1 + Q2)

Checkpoint: F3 + Q1 + Q2 + Q3 + Q4 + Q5 + S4 pass.

### Phase 3 — Pool manager + Ollama installer (≈ 4 days)

Goal: `PoolManager` can install, evict, and persist pool state. Operator can manually drive it via CLI.

- `pool/state.ts` — atomic on-disk persistence (`~/.harness/local-models/pool.json`)
- `pool/manager.ts` — capacity tracking, allowlist enforcement, install/evict orchestration
- `pool/eviction.ts` — lowest-score-LRU policy
- `installer/interface.ts` + `installer/ollama.ts` — `/api/pull` (streaming progress), `/api/delete`, `/api/tags`, `/api/show`
- `installer/advisory.ts` — copy-paste command renderer for non-Ollama backends
- CLI subcommands: `pool {show,set-budget,allow-org,allow-family}`, `install`, `evict`
- Integration tests against a local Ollama (gated; skip in CI if Ollama not present)

Checkpoint: F4 + F5 + F8 + S2 + S5 + O2 pass.

### Phase 4 — `LocalModelResolver` integration (≈ 2 days)

Goal: when `localModels.enabled = true`, resolver candidate list flows from pool state.

- Extend `LocalModelResolver` constructor to accept `poolState?: PoolStateProvider`
- Update `analysis-provider-factory` and `OrchestratorBackendFactory` wiring to pass the provider when LMLM is enabled
- Verify probe loop, status surface, named-backends map are unchanged
- Update `docs/knowledge/orchestrator/local-model-resolution.md`

Checkpoint: F4(c) verified end-to-end; N1 + N2 pass.

### Phase 5 — Proposal schema generalization + proposal engine (≈ 6 days)

Goal: refactor proposal schema to support multiple kinds, then ship the model-proposal lifecycle.

**Phase 5a — Schema refactor (≈ 2 days)**

- Refactor `packages/types/src/proposals.ts`: introduce base `ProposalSchema` with `proposalKind: 'skill' | 'model'` discriminator over a content union (D11)
- Migrate existing `SkillProposalSchema` consumers (storage layer, dashboard panel, CLI surface) to accept the generalized type. On read, records lacking `proposalKind` default to `'skill'` for backward compatibility.
- Verify all existing skill-proposal tests pass unchanged (N3)

**Phase 5b — Model proposal lifecycle (≈ 4 days)**

- `proposals/justification.ts` — render `RankedModel` diff into human-readable rationale
- `proposals/engine.ts` — diff current pool vs latest ranking, emit `ModelProposal` records, dedupe against pending + rejected history
- Register `proposalKind: 'model'` content schema + `ModelProposalRenderer` + `onApprove` + `onReject` handlers
- Stale-target handling: installer surfaces 404 as `failed_target_missing` status (D13, F11)
- CLI subcommands: `proposals`, `approve`, `reject`

Checkpoint: F6 + F7 + F11 + N3 pass.

### Phase 6 — Background scheduler + drift reconciliation (≈ 3 days)

Goal: orchestrator drives the refresh + reconcile + diff + propose cycle on a configurable cadence.

- `scheduler/refresh.ts` — interval timer with jitter, overlap guard, structured logging
- Drift reconciliation step (D12): each tick fetches `ollama tags` and removes pool entries no longer present in Ollama, freeing disk budget (F10)
- Wire startup/shutdown in `Orchestrator.start()` / `Orchestrator.stop()` when `localModels.enabled = true`
- Force-refresh path (`POST /api/v1/local-models/refresh` + `harness models refresh`)

Checkpoint: F6 + F10 + O1 + O4 pass.

### Phase 7 — HTTP routes + WS topics + notification sinks (≈ 3 days)

Goal: all four surfaces share a single source of truth.

- Five routes registered in orchestrator's HTTP server (per Technical Design table)
- Two WS topics broadcasting pool + proposal changes
- Notification-sink envelope for `model-proposal` event type
- `harness models status` returns full structured output

Checkpoint: end-to-end smoke test — change pool via CLI, observe WS broadcast, observe sink delivery.

### Phase 8 — Dashboard panel (≈ 4 days)

Goal: web operators get the same UX as CLI operators.

- New route `/local-models` in `packages/dashboard`
- Three cards: Hardware, Pool, Recommendations + Pending Proposals
- WS subscription for live updates
- Component tests for empty pool / HF down / no hardware fixtures (O3)

Checkpoint: F4 (e2e via dashboard) + O3 pass.

### Phase 9 — Docs + ADRs + plugin regeneration (≈ 2 days)

Goal: knowledge graph and operator guides reflect the new capability.

- 4 ADRs (per Integration Points)
- New `docs/knowledge/orchestrator/local-model-lifecycle.md`
- New `docs/guides/local-model-lifecycle.md`
- Updates to AGENTS.md, `local-model-resolution.md`, `provider-architecture.md`, `multi-backend-routing.md`, README, CHANGELOG
- `pnpm generate:barrels && pnpm generate:plugin:all`
- Roadmap entry via `manage_roadmap add`

Checkpoint: `harness validate` + `harness check-docs` pass; `pnpm generate:barrels:check && pnpm generate:plugin:check` clean.

---

**Total estimate:** ~35 working days (~7 weeks at one engineer). Phase 2 is the largest single risk (algorithm port + parity validation). Phase 5a (schema refactor) is a touch-many-files phase that requires careful migration of existing skill-proposal consumers.

Phases 1, 3, 4, 5, 6, 7 are mostly serial. Phase 5a (schema refactor) must precede Phase 5b. Phase 8 (dashboard) can run in parallel with 5b-7 once Phase 3's pool state shape and Phase 5a's generalized schema are locked. Phase 9 is end-of-pipeline.
