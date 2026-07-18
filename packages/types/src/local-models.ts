/**
 * Local Model Lifecycle Manager (LMLM) — configuration types.
 *
 * Phase 0 stub. Mirrors the config block defined in
 * `docs/changes/local-model-lifecycle-manager/proposal.md` (lines 178–198).
 * Runtime behavior arrives in Phases 1–9; this file only declares the shape
 * so consumers (CLI schema, orchestrator wiring) can reference it.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md
 */

/** Platforms supported for hardware detection (D7). AMD/ROCm deferred to v2. */
export type LocalModelsPlatform = 'macos' | 'nvidia' | 'cpu';

/** Installer backend choice (D4). `'advisory'` emits copy-paste commands only. */
export type LocalModelsInstallerBackend = 'ollama' | 'advisory';

/**
 * Optional manual override that skips hardware autodetection. When set, the
 * detector returns this profile verbatim and does not shell out.
 */
export interface LocalModelsHardwareOverride {
  platform: LocalModelsPlatform;
  vramGb: number;
  bandwidthGbps: number;
  ramGb?: number;
  gpuName?: string;
  cpuName?: string;
}

/**
 * Pool bounds — the operator's approved trust line. The orchestrator may
 * auto-pull, swap, and evict only within these bounds (D1).
 */
export interface LocalModelsPoolConfig {
  /** Hard ceiling on total on-disk size of installed pool members. */
  diskBudgetGb: number;
  /**
   * Hugging Face organization names whose models the orchestrator is allowed
   * to install (e.g., `'Qwen'`, `'deepseek-ai'`, `'meta-llama'`).
   */
  allowedOrgs: string[];
  /**
   * Optional model-family allowlist. Empty array means "all families under
   * the allowed orgs are permitted".
   */
  allowedFamilies: string[];
}

/**
 * Background refresh + proposal-emission cadence (D9). Defaults: 24h with
 * ±10min jitter. Minimum interval 1h to keep HF API usage civil.
 */
export interface LocalModelsRefreshConfig {
  /** Re-rank cadence in milliseconds. Default 86_400_000 (24h). Minimum 3_600_000 (1h). */
  intervalMs: number;
  /** Minimum score delta required to emit a swap proposal. Default 5. */
  proposalThreshold: number;
  /** Random jitter added to the interval to avoid thundering herd. Default 600_000 (10min). */
  jitterMs: number;
}

/** Installer adapter configuration. Only `backend: 'ollama'` performs auto-install in v1. */
export interface LocalModelsInstallerConfig {
  backend: LocalModelsInstallerBackend;
  /** Ollama REST endpoint. Only consulted when `backend === 'ollama'`. */
  ollamaEndpoint: string;
}

/**
 * Harness-fit probe configuration (D5, harness-fit-probe proposal). The probe
 * runs a benchmark-shortlisted candidate through a small contained coding task on
 * the REAL harness, judges whether it converges + acts-vs-narrates, and emits a
 * `buildQuality ∈ [0, 1]` that sharpens the agentic ranking. It is EXPENSIVE
 * (pull + single-dispatch), so it is cost-gated: opt-in, benchmark-top-N only,
 * cadence-limited, and cached by model+version. FAIL-OPEN — a probe error leaves
 * `buildQuality` undefined ⇒ no ranking effect.
 *
 * @see docs/changes/harness-fit-probe/proposal.md (D5, D6, SC4)
 */
export interface LocalModelsHarnessFitConfig {
  /**
   * Opt-in switch. Default `false` (harness-fit-probe D5): when false, no probe
   * ever runs and the ranking is byte-identical to the benchmark+heuristic rank.
   */
  enabled: boolean;
  /**
   * Probe only the benchmark top-N of the ranked shortlist — NEVER the full
   * discovered set. Default 3 (spec N≈3–5).
   */
  topN: number;
  /**
   * Minimum ms between probe passes. The probe runs on a cadence, not every
   * discovery refresh. Default 604_800_000 (7d).
   */
  cadenceMs: number;
  /**
   * Cache freshness window in ms — a `buildQuality` older than this is re-probed.
   * Keyed by model+version, so a release is stable within the window. Default
   * 2_592_000_000 (30d).
   */
  cacheTtlMs: number;
  /**
   * Optional probe-task-suite override (ids of the shipped `DEFAULT_HARNESS_FIT_TASKS`,
   * or operator-supplied tasks resolved at the composition root). Empty ⇒ the
   * shipped default suite.
   */
  taskIds?: string[];
}

/**
 * Top-level config block for LMLM. Lives under `localModels` on the root
 * harness config. Opt-in (`enabled: false` by default) preserves today's
 * behavior — disabling LMLM is byte-identical to the prior orchestrator.
 */
export interface LocalModelsConfig {
  /** Opt-in switch. Default false; when false, no LMLM code paths execute. */
  enabled: boolean;
  pool: LocalModelsPoolConfig;
  refresh: LocalModelsRefreshConfig;
  installer: LocalModelsInstallerConfig;
  /**
   * Harness-fit probe (D5, harness-fit-probe proposal). Optional + disabled by
   * default; when absent or `enabled: false`, the empirical `buildQuality` signal
   * is never fed and the ranking is byte-identical to the benchmark rank.
   */
  harnessFit?: LocalModelsHarnessFitConfig;
  hardware?: {
    /** Manual override that skips autodetection (D7 fallback path). */
    override?: LocalModelsHardwareOverride;
  };
}

/**
 * Request body for `POST /api/v1/local-models/pool/install` — operator-initiated
 * install of a recommended model. The server resolves `ollamaName` + disk size
 * from the current recommendations for `hfRepoId`.
 */
export interface PoolInstallRequest {
  /** HF repo id of the recommendation to install (e.g. `Qwen/Qwen3-32B-GGUF`). */
  hfRepoId: string;
  /** Optional quant to disambiguate when a repo has multiple ranked quants. */
  quant?: string;
}

/** Request body for `POST /api/v1/local-models/pool/remove`. */
export interface PoolRemoveRequest {
  /** Ollama name of the installed pool member to remove. */
  ollamaName: string;
}

/**
 * Outcome of an operator-initiated pool mutation.
 * - `installed` — the model was pulled into the pool.
 * - `removed` — the member was evicted.
 * - `deferred` — the member is in use; eviction is marked pending and drained
 *   after the current run (never mid-request).
 * - `installing` — the pull was kicked off in the background; the pool is not yet
 *   mutated. Progress + the terminal outcome arrive on the `local-models:install`
 *   WS topic (never in the HTTP response) so the request returns before undici's
 *   proxy `headersTimeout` fires on a multi-GB download.
 */
export type PoolMutationDisposition = 'installed' | 'removed' | 'deferred' | 'installing';

/** Response body for the install/remove convenience routes. */
export interface PoolMutationResult {
  disposition: PoolMutationDisposition;
  /** The proposal id created + auto-approved for this action (audit trail). */
  proposalId: string;
  /** Ollama names evicted as part of the action (budget auto-evictions or the removed member). */
  evicted: string[];
  /** Human-readable note (e.g. the deferral explanation). */
  message?: string;
}

/**
 * A single frame on the `local-models:install` WS topic, tracking one operator
 * install from kickoff to terminal outcome. Because the install route returns
 * `202` before the `ollama pull` finishes (D3 / async install), ALL install
 * progress and the final result reach the dashboard here rather than in the HTTP
 * response:
 *
 * - `started`  — the pull was accepted and kicked off (proposal created).
 * - `progress` — a byte-count update from the installer's `/api/pull` stream;
 *   `completedBytes`/`totalBytes` drive the progress bar.
 * - `complete` — the pull succeeded and the pool now holds the model (a
 *   `local-models:pool` refetch-delta fires alongside so the row flips to
 *   "installed").
 * - `error`    — the install failed (budget/allowlist/installer); `message` +
 *   `code` explain why and the row surfaces them.
 *
 * `hfRepoId` is the client-facing correlation key (the Recommendations row keys on
 * it); `ollamaName` is the resolved install target; `proposalId` ties back to the
 * audit trail.
 */
export interface ModelInstallEvent {
  proposalId: string;
  hfRepoId: string;
  ollamaName: string;
  phase: 'started' | 'progress' | 'complete' | 'error';
  /** Bytes pulled so far (`progress` frames only). */
  completedBytes?: number;
  /** Total bytes to pull, when the installer reports it (`progress` frames only). */
  totalBytes?: number;
  /** Installer status line (`progress`) or failure explanation (`error`). */
  message?: string;
  /** Stable failure code on `error` frames (e.g. `budget_exceeded`, `not_allowed`). */
  code?: string;
}
