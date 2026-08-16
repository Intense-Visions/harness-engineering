# @harness-engineering/local-models

## 0.7.5

### Patch Changes

- Updated dependencies [56f68f3]
- Updated dependencies [def9dc6]
- Updated dependencies [8559d5e]
- Updated dependencies [23de83f]
  - @harness-engineering/types@0.29.0

## 0.7.4

### Patch Changes

- Updated dependencies [5d6436c]
  - @harness-engineering/types@0.28.0

## 0.7.3

### Patch Changes

- a42b4f2: Correct stale LMLM candidate-discovery documentation and lock in the
  live-discovery → recommender wiring with regression tests.

  The live-HuggingFace → `RankerCandidate` parser (`parseHfModelToCandidates`),
  the fail-soft discovery function (`discoverCandidates`), and the orchestrator
  glue (`refreshCandidatesLive` → `seedRecommender`, wired at the CLI composition
  root and fired on startup + the operator Refresh button) are all in place — the
  autonomous swap-proposal loop consumes discovered candidates, so it is live, not
  inert. Three source comments (`Orchestrator.modelRecommender`,
  `startRefreshScheduler`, and `createNativeRecommender`) still asserted the
  parser "was never built" and that the recommender is "seeded with an empty
  candidate set"; those claims contradicted the shipped code and are corrected.

  Adds orchestrator integration tests covering the previously-untested glue:
  `refreshCandidatesLive` re-seeds the recommender with discovered,
  allowlist-filtered candidates and the recommender ranks them (proving the loop
  is live), plus the three fail-closed branches — discovery throws, discovery
  yields nothing installable, and no orgs approved — each keeping the standing
  frozen candidates. No runtime behavior change.

- Updated dependencies [21df39b]
- Updated dependencies [fc20e42]
- Updated dependencies [5c72805]
- Updated dependencies [7369e11]
- Updated dependencies [de52864]
- Updated dependencies [a766cda]
  - @harness-engineering/types@0.27.0

## 0.7.2

### Patch Changes

- Updated dependencies [0f64b7d]
- Updated dependencies [0921ca1]
  - @harness-engineering/types@0.26.0

## 0.7.1

### Patch Changes

- Updated dependencies [bb4de5e]
  - @harness-engineering/types@0.25.0

## 0.7.0

### Minor Changes

- c4c1dd3: feat(local-models): harness-fit probe — empirical agentic evidence for model recommendation

  The local-model recommender ranks candidates by benchmark evidence plus a thin
  agentic probe that only checks _"can the model emit a `tool_call`?"_ and _"is one
  turn fast enough?"_. A live 3-way head-to-head proved this necessary-but-insufficient
  for autonomous coding: `llama3.3:70b` **passes** the tool-calling gate and is fast,
  yet it **narrated instead of acting** (one tool call, no artifact, gate never green),
  while the smaller `gpt-oss:20b`/`qwen3.6:27b` **acted and converged**. No benchmark or
  thin-probe signal predicted that — only running the real harness did.

  The **harness-fit probe** supplies the missing empirical evidence. It runs a
  benchmark-shortlisted candidate through a small contained coding task **on the real
  harness**, judges convergence (the task's own acceptance command) plus act-vs-narrate
  metrics from the recording stream, and maps them to a coarse `buildQuality ∈ [0, 1]`
  (converged → HIGH, acted-not-converged → MID, narrated → LOW). That number feeds the
  **already-wired** `buildQuality` slot in the `agenticScore` composition — **no
  ranker-math change** — so at equal benchmark score an act-and-converge model out-ranks
  a narrate-only one for autonomous dispatch, while the default `score` ordering is
  untouched.
  - **Pure policy + injected runner (dependency inversion).** `local-models` owns the
    pure parts — the `buildQuality` mapping (`scoreBuildQuality`), the cost-gating policy
    (`selectProbeTargets` / `isProbeDue` / `isCacheFresh` / `probeCacheKey`), the portable
    task-suite schema + `DEFAULT_HARNESS_FIT_TASKS`, and the `HarnessFitRunner` interface.
    The concrete single-dispatch runner (Ollama backend + throwaway workspace + acceptance
    gate, reading the stream for act-vs-narrate metrics) is implemented in the orchestrator
    and injected at the composition root, so `local-models` never depends on the orchestrator.
  - **Single-dispatch convergence micro-probe.** The act-vs-narrate signal is decisive in
    one dispatch; best-of-1, cheapest real signal.
  - **Cost-gated (opt-in, top-N, cadence, cache, prefilter).** Disabled by default
    (`localModels.harnessFit.enabled`). When enabled, only the benchmark top-N are probed
    (never the full set), on a cadence (not every refresh), with `buildQuality` cached by
    model+version and VRAM-unfit / `toolCalling:false` candidates prefiltered out.
  - **Fail-open everywhere.** Any probe error/timeout/pull-failure leaves `buildQuality`
    undefined ⇒ no ranking effect; the refresh is never broken and the pool is never blocked.
  - **Config surface.** New optional `localModels.harnessFit` block (added to both the TS
    type and the Zod schema so it survives config parse) — `enabled`, `topN`, `cadenceMs`,
    `cacheTtlMs`, optional `taskIds`. Adopter-portable probe tasks self-describe their
    acceptance command, so a probe runs in any adopter project.
  - **Wired at the composition root (the probe actually fires).** `startRefreshScheduler`
    constructs the `HarnessFitProbeRunner`, a persistent `HarnessFitCacheFileStore` under
    `~/.harness/local-models/` (buildQuality cache + cadence timestamp), and a
    `reRankWithBuildQuality` binding that re-runs the SAME ranker over the held candidate
    set with probed `buildQuality` threaded in — passing them as the tick's `harnessFit`
    deps ONLY when `localModels.harnessFit.enabled` (config→deps translation:
    `cadenceMs → intervalMs`, `taskIds → tasks`). Disabled/absent ⇒ no deps are passed and
    the tick is byte-identical to before.
  - **Bounded (no hangs).** The runner enforces an overall per-probe wall-clock timeout
    (default 5 min) around both the dispatch and the acceptance-command spawn — `maxTurns`
    bounds turn count but not wall time, so a hung model or hanging acceptance is aborted
    into a fail-open `error` result instead of blocking the refresh tick.
  - **Converged-without-artifact is suspect.** A converged verdict only scores HIGH when the
    model actually touched a file; a trivially-passing acceptance with no artifact drops to
    MID/LOW rather than earning the top band.

  See ADR 0081 (harness-fit probe: benchmarks pre-filter, the harness judges agentic fitness).

- fac4261: feat(lmlm): probe + store per-model agentic tool-calling capability; require it for build routing

  The pool ranked local models purely on benchmark scores, so a model that can't drive an agentic
  build (it emits tool calls as TEXT the coding-agent SDK can't parse — e.g. qwen2.5-coder:7b) could
  rank top and silently no-op a build. Bake the capability into the pool so selection is aware of it:
  - **`probeToolCalling`** (`local-models`) — cheap-first: gate on Ollama `/api/show` `capabilities`
    (free; no `tools` ⇒ `false` with no inference), then one `/v1` tool-schema call to confirm the
    model actually emits native `tool_calls` (catches the "claims tools but emits text" false
    positive). Any failure ⇒ `undefined` (unknown ⇒ fail-open). The single-call FORMAT probe is
    deterministic, unlike the flaky multi-turn agentic loop.
  - **`PoolEntry.toolCalling?`** — additive, round-trips via the existing clone/loader; written once
    per model by the scheduler re-score (an injected probe seam) and never re-probed once decided.
  - **`poolStateToCandidates(state, profile, { requireToolCalling })`** — excludes entries known not
    to tool-call (`false`), keeping `true` + unprobed (`undefined`, fail-open).
  - **`LocalModelResolver`** requires tool-calling for AGENTIC (tier) use-cases only — a build never
    routes to a text-only model; triage/classification (which needs no tool-calling) is untouched.
  - The orchestrator binds the probe to the local backend endpoint when starting the refresh
    scheduler.

  Verified live: the probe returns `false` for qwen2.5-coder:7b and `true` for qwen3:8b / qwen3:32b.
  This makes the config-ordering fallback a belt-and-suspenders rather than the primary guard.

- 1db2507: Add an agentic-suitability dimension to the pool ranker so a
  fits-VRAM-but-unusable model is never routed autonomous work. Each
  `RankedModel` gains `agenticScore`, `agenticEligible`, and `agenticReasons`
  alongside the existing `score` (default ordering unchanged). The score
  composes a HARD tool-calling gate (a model that can't emit `tool_calls` is
  ineligible, not merely down-ranked), a measured agentic-latency gate/curve
  (a model over the latency budget is ineligible; under budget it scales
  inversely with latency), and existing benchmark quality. The ranker stays
  pure — signals arrive as candidate inputs; a new `probeAgenticSignals`
  helper (the only I/O, fail-open) fills them from the #833 tool-calling probe
  plus a timed agentic call.
- 2e78d78: Recency-aware local-model discovery. Discovery is now a wide net: per approved org it merges HuggingFace `trending` (new/hot) with `downloads` (established), dedupes by model id, and caps at the per-org limit, then hands the union to the benchmark ranker — instead of pre-filtering by cumulative downloads, which crowded out brand-new leaders before they could be scored. A failing `trending` call falls back to `downloads` (discovery never breaks). The `allowedOrgs` allowlist gains `openai`, `zai-org`, `THUDM`, `moonshotai` so the current-leader orgs can be considered. The benchmark ranker is unchanged — this only widens what reaches it.

### Patch Changes

- Updated dependencies [1de3ce4]
- Updated dependencies [84bd986]
- Updated dependencies [77815a8]
- Updated dependencies [c4c1dd3]
- Updated dependencies [fac4261]
- Updated dependencies [3e5f0ca]
- Updated dependencies [a0ef808]
- Updated dependencies [545e818]
- Updated dependencies [3b2b8ba]
- Updated dependencies [f460e42]
- Updated dependencies [84bd986]
- Updated dependencies [f8c9dd9]
  - @harness-engineering/types@0.24.0

## 0.6.0

### Minor Changes

- 2880b3a: feat(lmlm): probe + store per-model agentic tool-calling capability; require it for build routing

  The pool ranked local models purely on benchmark scores, so a model that can't drive an agentic
  build (it emits tool calls as TEXT the coding-agent SDK can't parse — e.g. qwen2.5-coder:7b) could
  rank top and silently no-op a build. Bake the capability into the pool so selection is aware of it:
  - **`probeToolCalling`** (`local-models`) — cheap-first: gate on Ollama `/api/show` `capabilities`
    (free; no `tools` ⇒ `false` with no inference), then one `/v1` tool-schema call to confirm the
    model actually emits native `tool_calls` (catches the "claims tools but emits text" false
    positive). Any failure ⇒ `undefined` (unknown ⇒ fail-open). The single-call FORMAT probe is
    deterministic, unlike the flaky multi-turn agentic loop.
  - **`PoolEntry.toolCalling?`** — additive, round-trips via the existing clone/loader; written once
    per model by the scheduler re-score (an injected probe seam) and never re-probed once decided.
  - **`poolStateToCandidates(state, profile, { requireToolCalling })`** — excludes entries known not
    to tool-call (`false`), keeping `true` + unprobed (`undefined`, fail-open).
  - **`LocalModelResolver`** requires tool-calling for AGENTIC (tier) use-cases only — a build never
    routes to a text-only model; triage/classification (which needs no tool-calling) is untouched.
  - The orchestrator binds the probe to the local backend endpoint when starting the refresh
    scheduler.

  Verified live: the probe returns `false` for qwen2.5-coder:7b and `true` for qwen3:8b / qwen3:32b.
  This makes the config-ordering fallback a belt-and-suspenders rather than the primary guard.

### Patch Changes

- Updated dependencies [ef62251]
  - @harness-engineering/types@0.23.0

## 0.5.2

### Patch Changes

- Updated dependencies [eb74585]
  - @harness-engineering/types@0.22.0

## 0.5.1

### Patch Changes

- ede964d: Reduce cyclomatic complexity across dashboard pages/components, local-models,
  orchestrator, and cli hooks via behavior-preserving extraction. No public API,
  CLI contract, or runtime behavior changes; security-sensitive sentinel hooks
  verified byte-identical in their detection rules. Resolves 18 baselined
  architecture complexity violations and clears three new complexity regressions.
- Updated dependencies [681e173]
- Updated dependencies [f004f04]
- Updated dependencies [ec649e6]
- Updated dependencies [abbaa89]
- Updated dependencies [ea36b3c]
- Updated dependencies [787e033]
- Updated dependencies [0c8e2ac]
  - @harness-engineering/types@0.21.0

## 0.5.0

### Minor Changes

- eb8435f: fix(lmlm): resilient model installs — resumable pulls, restart recovery, and lineage scoring

  Three follow-ups to the async operator install (#775):
  - **Resumable pulls.** `OllamaInstallAdapter` gains opt-in retry-with-resume
    (`maxPullRetries` / `pullRetryBackoffMs` / `pullRetryMaxBackoffMs`; the
    orchestrator enables 5). A multi-GB `ollama pull` that loses its `/api/pull`
    stream mid-download — most often the host sleeping mid-install — re-issues the
    pull (ollama resumes from cached blobs) instead of dead-ending in an error. The
    budget counts consecutive non-progressing attempts, so any forward byte progress
    resets it; a canceled request or a missing model still fails fast.
  - **Restart recovery.** A model add/swap approval marks its proposal `installing`
    (new `ModelProposalStatus`) for the duration of the pull. If the orchestrator
    restarts mid-download, startup finds the `installing` proposals and re-drives them
    — `onApproveModelProposal` is idempotent, so ollama resumes the pull (or no-ops if
    it already finished) and progress streams to a reconnecting dashboard. The status
    reverts to `open` on a retryable failure, and the approve route rejects a
    re-approve while `installing`.
  - **Lineage score interpolation.** A candidate with no direct benchmark used to
    floor to `score: 0` while labelled `evidence: 'interpolated'` (a misnomer), so real
    models like `Qwen/Qwen3-8B-GGUF` showed "score 0 · interpolated" and churned the
    pool once installed. The ranker now infers a score from same-series siblings by
    parameter count (linear in size, clamped to the measured range, dampened by `'low'`
    benchmark confidence so it never outranks a direct measurement); only a series with
    no measured sibling still scores 0.

- 134b055: feat(lmlm): live HuggingFace candidate discovery on startup + Refresh button

  The recommendation candidate list was a bundled, human-curated `candidates.json`
  imported statically at build. The orchestrator now refreshes it **live from
  HuggingFace** — on startup (in the background, non-blocking) and on the operator's
  **Refresh** button — while keeping the frozen list as the offline-safe fallback.
  - New `discoverCandidates()` in `@harness-engineering/local-models` composes the
    existing HF client + GGUF parser and **merges the curated `ollamaName`/`family`
    tags** from the frozen snapshot back in — the HF API doesn't carry them, and a
    candidate without an `ollamaName` isn't installable, so an un-mappable model is
    dropped rather than surfaced as a broken row.
  - The orchestrator seeds the recommender from the frozen list immediately, then
    swaps in live results when discovery returns; `POST /api/v1/local-models/candidates/refresh`
    re-discovers + re-seeds + re-ranks on demand. Fail-closed: any HF error or empty
    result keeps the current candidates.
  - The dashboard **Refresh** button now triggers the live refresh (one button = "get
    the latest").
  - Discovery defaults to a no-op on the `Orchestrator` (so tests make no network
    calls); the CLI's `orchestrator run` wires the real implementation.

  Delivers the `lmlm-live-hf-candidate-discovery` roadmap item. Note: discovery
  refreshes/ranks the **curated** model set — onboarding a brand-new installable
  model still needs its `ollamaName` mapping added (a deliberate curation boundary).

- be3c714: feat(lmlm): consume pooled models freshly — event-driven refresh, live analysis model, score-seed, runtime feedback, task-aware selection, warming

  The pool install side was fast, but consumption was pull-based and static: a
  newly installed model wasn't used by agents for up to a poll cycle and by the
  analysis pipeline never (until restart), a fresh entry sat at `currentScore: 0`,
  runtime outcomes didn't feed back, and selection ignored the ranker's per-task
  profiles. This wires the pool through to inference.
  - **Freshness loop** — `LocalModelResolver.refresh()` debounce-re-probes on a
    `local-models:pool` mutation, so an install/swap is resolvable in seconds. The
    analysis provider reads its model live per request (`getModel` seam) instead of
    snapshotting once at construction, unless the operator pinned a layer model.
  - **Score-seed** — an installed pool entry seeds `currentScore` from its ranked
    score rather than `0`, so an explicitly-installed model isn't buried until the
    next re-rank.
  - **Runtime feedback** — `lastUsedAt` is stamped on real inference; a model that
    fails N consecutive inferences is deprioritized until it recovers.
  - **Task-aware selection** — per-profile pool scoring (general/coding/reasoning)
    routes each use-case to its best-fit pooled model, degrading to composite score
    when the benchmark snapshot lacks profile tags.
  - **Warming** — the resolver best-effort warms a newly selected model
    (`keep_alive`) so the next dispatch isn't a cold start.

  See `docs/changes/lmlm-pool-consumption/proposal.md` and the task-aware selection
  ADR under `docs/knowledge/decisions/`.

### Patch Changes

- db24d89: fix(lmlm): async model install with WebSocket download progress

  Operator model install (`POST /api/v1/local-models/pool/install`) now returns
  `202 { disposition: 'installing' }` as soon as the pull is accepted and streams
  byte-level download progress plus the terminal outcome over a new
  `local-models:install` WebSocket topic, instead of blocking the HTTP response for
  the entire `ollama pull`.

  This fixes the `502 Orchestrator proxy error: fetch failed (cause: Headers Timeout
Error)` that a multi-GB pull triggered — the dashboard reverse-proxy's undici
  `headersTimeout` (~5 min) fired because no response headers were sent until the
  pull completed. The Recommendations panel now renders a live download progress bar
  and surfaces retryable install errors.

  Approving an `add`/`swap` model **proposal** (`POST /api/v1/proposals/:id/approve`)
  also installs the target, so it shares the same async treatment: it returns `202`
  and streams the download over `local-models:install`, and the Pending Proposals row
  shows the same progress bar instead of hanging the Approve button until the proxy
  times out. (`evict` approvals and rejects stay synchronous.)

  The Recommendations panel also gains a **Refresh** button that triggers a
  force-refresh tick (`POST /api/v1/local-models/refresh`) to recompute
  recommendations on demand and refetch the panel.

  Fixes a refresh-tick ordering bug where the pool was diffed against the ranking
  **before** the re-ranked scores were written back. A freshly-installed member
  enters the pool at `currentScore: 0` until its first re-rank, so diffing first
  produced phantom swap proposals justified as "replace a pool member scoring 0"
  (and inflated `scoreDelta`s). The tick now re-scores the pool before diffing.

- f3a4d31: fix(lmlm): distinguish same-model quant rows + stop duplicate swap proposals

  Two "same item" confusions on the Local Models panel:
  - **Recommendations** listed the same `hfRepoId` at two quants (e.g. `Qwen3-32B`
    Q4_K_M @ 21.5 GB and Q8_0 @ 35.1 GB) as visually identical rows because the quant
    was never shown. The row now displays the quant, so the two options read as the
    distinct VRAM/speed trade-offs they are.
  - **Pending proposals** could show the same install target twice (e.g. two
    "Swap in llama3.3:70b" rows for different pool members). The diff engine's dedup
    was per-`(target, replaces)` pair, so across ticks the same model accumulated
    multiple pending proposals — all pulling the same blob. The engine now also
    suppresses a candidate that is already the install target of an **open** proposal
    (rejections stay pair-scoped, since declining one swap of a model does not veto a
    different swap of it).

- f3a4d31: fix(lmlm): round numbers on the Local Models panel so raw floats stop leaking

  Disk usage, pool entry sizes/scores, hardware values, and the model-proposal
  justification text rendered raw floats (`75.65831765532494 GB`,
  `score 57.629999999999995`, `18.067657947540283GB VRAM est`). They now follow the
  panel's existing convention via a shared formatter: sizes/VRAM to one decimal,
  absolute scores as whole numbers. The server-side `buildJustification` rounds the
  score and VRAM values it embeds, so the stored proposal summary is clean too.

- Updated dependencies [db24d89]
- Updated dependencies [eb8435f]
- Updated dependencies [be3c714]
  - @harness-engineering/types@0.20.0

## 0.4.0

### Minor Changes

- a9c8994: feat(lmlm): wire pool bounds seed + candidate source so the Local Models cards populate

  Completes the two deferred wiring gaps that left the dashboard's Pool and
  Recommendations cards permanently empty when LMLM is enabled.
  - **Pool bounds seed (Phase 1):** the orchestrator now applies the operator's
    configured `localModels.pool` bounds (disk budget + org/family allowlist) to
    the pool store on startup, after `PoolStateStore.load()` so declarative config
    wins over stale persisted bounds. Previously `PoolManager.configurePool()` had
    no caller and the pool defaulted to `diskBudgetGb: 0`, blocking every install.
  - **Candidate source (Phase 2):** a new `candidates` module in
    `@harness-engineering/local-models` — a GGUF→`RankerCandidate` parser, a
    bundled human-curated frozen candidate snapshot (offline-safe, deterministic),
    and an allowlist-aware selector — feeds the recommender, which was previously
    constructed with an empty candidate list. Live HuggingFace discovery runs in a
    new on-demand `scripts/refresh-model-candidates.mjs` generator (fail-closed),
    never in CI.
  - **Recommendations card formatting:** VRAM and tok/s render to one decimal and
    scores as whole numbers, instead of leaking full float precision (e.g.
    `44.15923222899437 GB` → `44.2 GB`).

### Patch Changes

- cfc06d2: fix(local-models): resolve model size from /api/tags when Ollama's /api/show omits it

  `OllamaInstallAdapter.inspect` required a size field from `/api/show`, but modern
  Ollama omits it there (the on-disk size lives in `/api/tags`). This made every
  install that relies on `inspect` — including the dashboard's Install button,
  which lets `PoolManager.install` resolve the size — fail with `parse_failed`.
  `inspect` now falls back to `/api/tags` for the size (keeping `/api/show`'s
  digest/metadata), and only fails when the model is absent from both.

- Updated dependencies [bae23ad]
  - @harness-engineering/types@0.19.0

## 0.3.0

### Minor Changes

- 965cfd3: Local Model Lifecycle Manager (LMLM) backend: hardware-aware ranking + pool
  manager + Ollama installer in the new `@harness-engineering/local-models`
  package; generalized discriminated `ProposalSchema` (`kind: 'skill' | 'model'`,
  backward-compatible on read) in types + the shared proposal store in core;
  background refresh scheduler with silent drift reconciliation, the
  `/api/v1/local-models/*` read routes, kind-aware approve/reject, and
  `local-models:{pool,proposal}` WS topics in the orchestrator; and the
  `harness models {status,suggest,pool,proposals,approve,reject,install,evict,refresh}`
  CLI. Opt-in via `localModels.enabled`; default-off behavior is unchanged.

### Patch Changes

- Updated dependencies [965cfd3]
  - @harness-engineering/types@0.18.0

## 0.2.3

### Patch Changes

- Updated dependencies [3d772e9]
  - @harness-engineering/types@0.17.0

## 0.2.2

### Patch Changes

- Updated dependencies [4df8934]
- Updated dependencies [863df8f]
  - @harness-engineering/types@0.16.2

## 0.2.1

### Patch Changes

- Updated dependencies [8e8e7c1]
  - @harness-engineering/types@0.16.1

## 0.2.0

### Minor Changes

- 8fefe5c: Adds Phase 1 of the Local Model Lifecycle Manager — hardware detection.

  The new `HardwareDetector` returns a `HardwareProfile` on macOS (Apple Silicon), Linux/Windows with NVIDIA, and CPU-only hosts. The dispatcher honors an operator override ahead of autodetection, caches results for 24h by default to match the spec's refresh cadence, and falls through to a CPU profile with a structured warning when a platform-specific probe fails — it never throws (S3).
  - `detectMacOS` parses `system_profiler SPDisplaysDataType -json` + `sysctl` and maps Apple Silicon chips (M1 through M4 Max) to their published unified-memory bandwidths.
  - `detectNVIDIA` parses `nvidia-smi --query-gpu=name,memory.total` and maps NVIDIA GPUs (Ada, Ampere, Hopper) to their published memory bandwidths. Multi-GPU hosts pick the highest-VRAM card and warn.
  - `detectCPU` derives a conservative bandwidth heuristic by regex-matching the CPU brand string against known DDR4/DDR5 desktop and DDR5/DDR4 server families.
  - Shell-outs are dependency-injected via a `ShellRunner` interface so unit tests stay deterministic across CI hosts.

  No orchestrator wiring yet — the detector is consumed by the ranker (Phase 2), scheduler (Phase 6), and HTTP/dashboard surfaces (Phases 7–8). LMLM remains opt-in and disabled by default per Phase 0.

- 0a90f37: Adds Phase 2a of the Local Model Lifecycle Manager — the HuggingFace data plane and the frozen benchmark snapshot.
  - `HuggingFaceClient` is a typed wrapper over the public HF REST endpoints (`/api/models`, `/api/models/:repo`). Every failure mode maps to a stable `HuggingFaceClientError` code (`HF_NOT_FOUND`, `HF_UNAUTHORIZED`, `HF_UNAVAILABLE`, `HF_NETWORK`, `HF_PARSE`) so the cache and the future ranker can branch deterministically.
  - `HuggingFaceCache` is a versioned in-memory + on-disk cache for HF responses. The on-disk file at `~/.harness/local-models/cache/huggingface.json` is written atomically via tmp + rename (mirrors the proposal's O2 invariant). Missing, malformed, or schema-mismatched files reset to an empty cache and emit a structured warning instead of throwing.
  - `loadFrozenSnapshot` returns the bundled benchmark snapshot the orchestrator falls back to when HF and the live leaderboard sources are unreachable (S4). The loader is intentionally lenient — malformed or schema-invalid input yields a typed warning and an empty snapshot, never a throw.
  - A seed `snapshot.json` ships three placeholder models across Qwen / DeepSeek / Llama so Phase 2c has something to merge against on its first run.
  - The HF `fetcher` and the cache filesystem are injected through narrow interfaces — unit tests stay fully deterministic without touching the network or the real `~/.harness` directory.

  No orchestrator, CLI, dashboard, or HTTP wiring yet. VRAM/speed math (Phase 2b), evidence + recency grading (Phase 2c), the merge algorithm (Phase 2c), the `RankedModel` orchestrator (Phase 2d), and the parity tests against the whichllm reference outputs (Phase 2d) land in subsequent slices. LMLM remains opt-in and disabled by default per Phase 0.

- 24d0bd5: Adds Phase 2b of the Local Model Lifecycle Manager — the VRAM and speed estimators the ranker (Phase 2c–d) will compose.
  - `normalizeQuantId` resolves any GGUF / MLX quant string the HF ecosystem actually emits (canonical keys, case variants, common aliases like `'q4_k_m'`, `'mlx-q4'`, `'fp16'`, `'q4'`) to a canonical `{ canonical, known, bitsPerWeight }` record. Unknown ids fall through to a conservative 8-bit fallback and surface as `known: false` so downstream callers can flag the estimate.
  - `estimateVram({ sizeB, activeB?, quant, contextTokens?, kvCacheQuant? })` returns the four-term decomposition the dashboard's "why this won't fit" tooltip will eventually show — weights, KV cache, activations, framework overhead — pre-summed into `totalGb`. Weights are sized off the total params (MoE keeps all weights resident); KV cache scales linearly with `contextTokens` and respects the kv-cache quantization multiplier.
  - `estimateSpeed({ sizeB, activeB?, quant, hardware, vramEstimate, backend? })` returns the bandwidth-bound token throughput projection plus enough provenance for the ranker's justification text (`effectiveBandwidthGbps`, `partialOffloadFraction`, `activeWeightsGb`, `backend`, `confidence`). MoE active params drive throughput, partial-offload blends GPU bandwidth with a conservative CPU floor, and `tokPerSec` short-circuits to 0 with `confidence: 'low'` when the model won't fit at all — the estimator never throws.

  The canonical `QUANT_BITS_PER_WEIGHT` table, `BACKEND_EFFICIENCY` table, and `CPU_BANDWIDTH_FLOOR_GBPS` live as named constants in one place so Phase 2d's parity fixtures can retune them without touching call sites.

  No orchestrator, CLI, dashboard, or HTTP wiring yet. Evidence + recency grading (Phase 2c), the cross-source benchmark merge (Phase 2c), the `RankedModel` orchestrator (Phase 2d), and the parity tests against the whichllm reference outputs (Phase 2d) land in subsequent slices. LMLM remains opt-in and disabled by default per Phase 0.

- 1efe708: Adds Phase 2c of the Local Model Lifecycle Manager — the evidence grader, the lineage-aware recency demotion, two seed benchmark source adapters, and the cross-source merge the ranker (Phase 2d) will compose with Phase 2b's VRAM/speed math.
  - `gradeEvidence({ observationModel, observationQuant, targetModel, targetQuant, lineagePosition?, observationEvidence? })` returns one of `'direct' | 'variant' | 'base' | 'interpolated' | 'self-reported'` with its calibrated confidence multiplier from `EVIDENCE_CONFIDENCE`. `'self-reported'` is an absorbing tag (no upgrade); `-GGUF` / `-MLX` / `-AWQ` / `-GPTQ` mirror suffixes are stripped before model comparison so `Qwen/Qwen3-32B-GGUF` and `Qwen/Qwen3-32B` collapse to one identity. Quant alias resolution goes through `normalizeQuantId` so `'q4_k_m'` and `'Q4_K_M'` match.
  - `applyRecencyDecay({ observedAt, snapshotDate, lineagePosition? })` ages observations on an exponential curve with `HALFLIFE_MONTHS = 9` and applies a per-generation `LINEAGE_STEP_PENALTY = 0.6` multiplier on top. The final weight clamps to `MIN_RECENCY_WEIGHT = 0.05` so no observation is fully zeroed out. Future-dated observations and malformed ISO strings degrade safely to age-zero rather than throwing.
  - `openLlmLeaderboardSource` and `huggingFacePopularitySource` implement the new `BenchmarkSource` interface. Both take an injected `Fetcher` so CI mocks the wire and the live network is not touched during tests. Every failure path (network, schema, parse) surfaces a structured `SourceWarning` rather than throwing — same discipline as Phase 2a's frozen snapshot loader. The leaderboard adapter emits `direct` observations across the leaderboard's benchmark slugs; the popularity adapter emits a synthetic `'hf-popularity'` benchmark from `downloads + likes × LIKE_WEIGHT`, normalised against the per-fetch maximum.
  - `mergeBenchmarks({ observations, target, snapshotDate, sourceWeights? })` weights each observation by `evidenceConfidence × recencyWeight × sourceWeight`, normalises source-native scales into `[0, 1]`, and emits `{ score (0–100), confidence: 'high' | 'medium' | 'low', contributions[] }`. `'high'` requires at least one `direct` observation with `recencyWeight ≥ 0.8`; `'low'` when no observation graded above `interpolated` or every combined weight `< 0.3`. `DEFAULT_SOURCE_WEIGHTS` defaults popularity to a quarter of a leaderboard score; callers override via `sourceWeights`. Unknown sources fall back to `DEFAULT_UNKNOWN_SOURCE_WEIGHT = 0.5`.

  No orchestrator, CLI, dashboard, or HTTP wiring yet. Phase 2d composes Phase 2c's merge output with Phase 2b's VRAM/speed math into the `RankedModel` orchestrator and adds the whichllm parity fixtures (Q1, Q2). LMLM remains opt-in and disabled by default per Phase 0.

- e4f070a: Adds Phase 2d of the Local Model Lifecycle Manager — the `RankedModel` orchestrator (`rankModels`) and the two parity fixtures called out in spec success criteria Q1 + Q2.
  - `rankModels(input: RankInput): RankResult` composes the Phase 2b math (`estimateVram`, `estimateSpeed`) and the Phase 2c fusion (`mergeBenchmarks`) into a single hardware-aware ranking. The orchestrator is pure: candidates in, ranked models out, no I/O. Won't-fit candidates are filtered from the default result so callers conform to F3 / Q3 without an extra step; `options.includeUnfit: true` keeps them at the bottom with `score: 0` so a dashboard can explain why a popular model is missing. Sorting is deterministic across runs and locales: `score` desc → `estimatedTokPerSec` desc → `hfRepoId` ascending code-point order (we deliberately avoid `localeCompare` because case-sensitivity flips silently between CI environments and would corrupt the parity fixtures).
  - `RankedModel` matches the spec's Core types block (proposal.md lines 124–138) and adds the full per-contributor breakdown (`vramEstimate`, `speedEstimate`, `benchmarkScore`) so the dashboard's "why this score?" tooltip and the Phase 5b proposal-justification renderer can show provenance without re-running the math. The row's `evidence` field is the **weakest** grade among the merged contributions — operators read it as "how trustworthy is the supporting evidence?", so a single self-reported observation flags the row even when a direct observation also contributes.
  - `LiveObservation = BenchmarkObservation & { hfRepoId }` carries the model anchor the Phase 2c `BenchmarkObservation` shape deliberately omits. The orchestrator filters live observations by `hfRepoId` before handing the per-candidate slice to `mergeBenchmarks`; Phase 6's scheduler will refactor the source adapters to emit `LiveObservation[]` directly so the model dimension stops being re-stitched at call time.
  - `scaleScore` folds the merge's `confidence` label and the speed estimator's `confidence` band into the orchestrator-level score (`BENCHMARK_CONFIDENCE_MULTIPLIER = { high: 1, medium: 0.85, low: 0.6 }`, `SPEED_CONFIDENCE_MULTIPLIER = { high: 1, medium: 0.9, low: 0.75 }`). This is what makes Q4 / Q5 hold at the `RankedModel.score` boundary: the merge's weighted-mean math collapses to the same raw score for a single-observation direct vs self-reported, so the confidence label is the only signal that distinguishes them in that case — and the orchestrator's score field has to carry the signal forward for downstream ranking.
  - Parity fixtures `tests/ranker/parity/m3-max-36gb.json` and `tests/ranker/parity/rtx-4090-24gb.json` pin the top-1 model id (`deepseek-ai/DeepSeek-R1-Distill-Qwen-32B-GGUF`) and a `[scoreMin, scoreMax]` band `[55, 60]` for the two hardware profiles the spec names. The bundled seed benchmark snapshot is the source of truth; CI never invokes whichllm. Refreshing the fixtures is a manual maintenance task tied to each v1.x release — the file format is intentionally small so the diff review is fast.
  - `RankerWarning` surfaces degraded paths the algorithm took. `snapshot_unavailable` fires when the caller passes the empty-snapshot fallback envelope (S4) and emerges once per call, not per candidate, so the orchestrator's invariant "never throws" composes cleanly with the merge's invariant "empty input → low confidence, score 0".

  The `PoolManager` orchestrator that combines this ranking layer with the install adapter, allowlist enforcement, and budget-driven eviction lands in Phase 3c. The `LocalModelResolver` integration, proposal engine + schema generalization, background scheduler, and HTTP / WS / CLI / dashboard surfaces ship in Phases 4–9 per the spec. LMLM remains opt-in and disabled by default per Phase 0; nothing in this slice changes the orchestrator's behavior on a config without a `localModels` block (N4).

- 7eacc57: Adds Phase 3a of the Local Model Lifecycle Manager — the pool-state persistence primitive and the lowest-score-LRU eviction planner the Phase 3b Ollama installer + `PoolManager` will compose.
  - `PoolStateStore` atomically persists the pool record to `~/.harness/local-models/pool.json` via the same tmp + rename pattern the HuggingFace cache uses (O2 in the spec). `load()` tolerates missing (no warning — fresh install), malformed-JSON, schema-version-mismatched, and shape-mismatched files by resetting to `EmptyPoolState()` and emitting a single structured warning; the store never throws on a degraded file. The persisted envelope is versioned (`POOL_STATE_VERSION = 1`) so a Phase 3+ format change resets safely instead of silently consuming stale data.
  - `update(mutator)` is the single mutation path. After every call the store recomputes `diskUsedGb` from the entry sum so a caller cannot drift the field away from `entries.sizeOnDiskGb` — the "derived data" invariant lives in the store, not at each call site. `snapshot()` returns a structured clone so reads cannot leak references back into the authoritative record.
  - `planEviction({ state, freeBudgetGb })` returns an `EvictionPlan` whose `evict[]` is ordered lowest-`currentScore` first, with ties broken by oldest `lastUsedAt` (treating `null` as oldest so unused fresh installs evict before recently-resolved entries at the same score) and then oldest `installedAt`. `freedGb` is the cumulative `sizeOnDiskGb` of the selection; `remainingNeededGb` is the shortfall when the pool cannot satisfy the budget. The function is pure — no I/O, no mutation, no throws on negative / zero / oversized budgets.
  - A `PoolFilesystem` port mirrors the cache's `CacheFilesystem` so tests substitute an in-memory implementation without touching the disk; the two ports stay decoupled so neither module forces a shape on the other.

  The installer interface, the `PoolManager` orchestration layer that combines this store with allowlist enforcement and an Ollama install adapter, the `LocalModelResolver` integration that consumes the pool state as the resolver's candidate list, the proposal engine + schema generalization, the background scheduler, and the HTTP / WS / CLI / dashboard surfaces all land in Phases 3b–8. LMLM remains opt-in and disabled by default per Phase 0; nothing in this slice changes the orchestrator's behavior on a config without a `localModels` block.

- 2a236ba: Adds Phase 3b of the Local Model Lifecycle Manager — the install-adapter layer the Phase 3c `PoolManager` orchestrator will compose with Phase 3a's `PoolStateStore` + `planEviction`.
  - `InstallAdapter` contract (`install`, `evict`, `list`, `inspect`) is transport-agnostic. In-band failures of `install`/`evict` (target missing, install_failed, not_in_pool) resolve to `InstallResult` with `status: 'error'` so the manager can `switch (result.code)` cleanly; out-of-band failures (`parse_failed`, `advisory_only`) throw `InstallError` with the same stable `InstallErrorCode` taxonomy higher layers branch on (`advisory_only`, `failed_target_missing` (D13), `installer_unavailable` (S6), `install_failed` (S7), `not_in_pool` (D12), `parse_failed`).
  - `OllamaInstallAdapter` speaks `/api/pull` (NDJSON-streamed progress decoded into typed `InstallEvent`s: `pulling | progress | success | error`), `/api/delete`, `/api/tags`, and `/api/show` against a configurable endpoint (default `http://localhost:11434`). Mid-stream cancellation via `AbortSignal` resolves to `install_failed` so the manager (S7) can decide whether to invoke `evict` for partial-byte cleanup. Network rejects map to `installer_unavailable`; 404s map to `failed_target_missing`; malformed NDJSON lines are logged via `onWarn` and skipped without breaking the stream. A faulty `onEvent` consumer is caught and logged so it cannot strand an in-flight install.
  - `AdvisoryInstallAdapter` covers LM Studio / vLLM / llama.cpp (D4). `install` and `evict` reject with `InstallError('advisory_only', …)` carrying the copy-paste command (`lms get …`, `vllm serve …`, `llama-server -m …`) the operator runs manually; `list` returns `[]` (the resolver probe loop is authoritative for advisory backends); `inspect` rejects with `advisory_only`. Names are shell-quoted on render so a hostile-looking model id cannot break the rendered command.
  - `nullInstallAdapter()` ships as the manager's default when LMLM is disabled and as a test seam for scenarios that don't exercise the install path; every method rejects with `installer_unavailable` so an accidental invocation surfaces structurally instead of as an `undefined` method call.
  - `InstallError.toJSON()` preserves the `code` discriminant across the structured-logger boundary so an operator reading `~/.harness/logs/orchestrator.jsonl` keeps the error taxonomy after `JSON.stringify` would otherwise drop it.

  The `PoolManager` orchestrator that combines this layer with allowlist enforcement and budget-driven eviction lands in Phase 3c. The `LocalModelResolver` integration, proposal engine + schema generalization, background scheduler, and HTTP / WS / CLI / dashboard surfaces ship in Phases 4–9 per the spec. LMLM remains opt-in and disabled by default per Phase 0; nothing in this slice changes the orchestrator's behavior on a config without a `localModels` block.

- 3588062: Adds Phase 3c of the Local Model Lifecycle Manager — the `PoolManager` orchestrator that composes Phase 3a's `PoolStateStore` + `planEviction` with Phase 3b's `InstallAdapter` into the single high-level API later phases consume.
  - `PoolManager.install` runs the full slot pipeline in one call: allowlist gate against `allowedOrgs` / `allowedFamilies` (D1, F8) → idempotent short-circuit when the entry already exists → `installer.inspect` to resolve the disk footprint (skipped when the caller passes `sizeOnDiskGb`, the path Phase 5b's proposal engine prefers) → capacity check against `diskBudgetGb - diskUsedGb` → pre-commit `installer.evict` per `planEviction` plan in lowest-score-LRU order (F5) → `installer.install` → append `PoolEntry` + persist atomically (O2 via Phase 3a). Returns a discriminated `InstallPoolResult` whose `evicted: PoolEntry[]` lists exactly what changed.
  - Budget enforcement is hard at the engine layer (S5): an install whose target exceeds even the fully-evicted pool resolves to `{ status: 'error', code: 'budget_exceeded' }` without invoking the installer. Every Phase 3b error code (`advisory_only`, `failed_target_missing`, `installer_unavailable`, `install_failed`, `not_in_pool`, `parse_failed`) propagates unchanged so the proposal engine (Phase 5b) and scheduler (Phase 6) branch on the same taxonomy.
  - `install_failed` triggers a best-effort `installer.evict` cleanup of partial bytes (S7); `installer_unavailable` does not (the installer is down — cleanup wouldn't reach it; S6); `failed_target_missing` does not (nothing was downloaded; D13).
  - `PoolManager.evict` invokes `installer.evict`, removes the entry from pool state, and persists once. An installer reply of `not_in_pool` is treated as silent D12 drift reconciliation — the entry is dropped from pool state and the result carries `reconciled: true`. An `installer_unavailable` reply preserves pool state (S6 — keep the operator's record until we can confirm the install backend agrees).
  - `PoolManager.reconcile()` lists the installer's models and prunes pool entries the installer no longer reports (D12, F10 primitive). Auto-import is not done — that would cross the autonomy boundary (D1). A transport failure leaves pool state untouched and emits `onWarn` so the scheduler's next tick can retry.
  - `PoolManager.markUsed(name)` and `PoolManager.updateScores(updates)` are the bookkeeping seams Phase 4's `LocalModelResolver` and Phase 6's scheduler will call after each resolved dispatch / re-rank tick. Both persist once per call and silently no-op when no update applies.
  - `PoolManager.configurePool(partial)` is the Phase 7 CLI seam for `pool {set-budget, allow-org, allow-family}`. Updates only the supplied fields; existing entries are preserved.
  - `PoolManager.snapshot()` and `PoolManager.isAllowed({ hfRepoId, family? })` are the read-only seams every consumer (resolver, proposal engine, dashboard, CLI) uses. Org matching is case-sensitive (HF registry truth); family matching is case-insensitive on the operator-typed slug.

  The CLI subcommands, `LocalModelResolver` integration, proposal engine + schema generalization, background scheduler, and HTTP / WS / dashboard surfaces ship in Phases 4–9 per the spec. LMLM remains opt-in and disabled by default per Phase 0; nothing in this slice changes the orchestrator's behavior on a config without a `localModels` block.

### Patch Changes

- 5f9ed8c: Scaffolds the Local Model Lifecycle Manager (LMLM) — Phase 0.
  - New package `@harness-engineering/local-models` (empty barrel, no business logic yet).
  - New types in `@harness-engineering/types`: `LocalModelsConfig`, `LocalModelsPoolConfig`, `LocalModelsRefreshConfig`, `LocalModelsInstallerConfig`, `LocalModelsHardwareOverride`, plus platform/installer unions.
  - New optional `localModels` block on `HarnessConfigSchema` in the CLI, with Zod defaults that match the spec (24h refresh, 100GB budget, Ollama installer, opt-in disabled by default).

  Disabled by default; `harness validate` on existing configs remains green. Hardware detection, ranking, pool management, installer, proposal lifecycle, scheduler, HTTP/WS surfaces, CLI commands, and dashboard panel land in subsequent phases per `docs/changes/local-model-lifecycle-manager/proposal.md`.

- Updated dependencies [5f9ed8c]
- Updated dependencies [318b878]
  - @harness-engineering/types@0.16.0
