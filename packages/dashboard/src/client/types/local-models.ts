/**
 * Client-side type mirror for the Local Model Lifecycle Manager (LMLM) panel.
 *
 * D-P8-1: importing values from `@harness-engineering/local-models` into the
 * browser bundle would drag Node-only detector code (`child_process`,
 * `system_profiler`) through Vite. The codebase convention is a hand-maintained
 * client mirror (see `src/client/types/orchestrator.ts`). These `Dash*` types
 * mirror only the fields the panel renders.
 *
 * SOURCE OF TRUTH — keep in sync with:
 *   - `packages/local-models/src/hardware/types.ts`  (HardwareProfile)
 *   - `packages/local-models/src/pool/types.ts`      (PoolEntry/View, PoolState/View)
 *   - `packages/local-models/src/ranker/types.ts`    (RankedModel)
 *   - `packages/types/src/local-models.ts`           (LocalModelsPlatform)
 *   - `packages/types/src/proposals.ts`              (ModelProposalRecord — reused directly)
 * These are frozen Phase-1/2/3 shapes; only the dashboard-rendered subset is mirrored.
 */

/** Mirror of `LocalModelsPlatform` (`packages/types/src/local-models.ts`). */
export type DashLocalModelsPlatform = 'macos' | 'nvidia' | 'cpu';

/**
 * Mirror of the `HardwareProfile` subset the Hardware card renders
 * (`packages/local-models/src/hardware/types.ts`).
 */
export interface DashHardwareProfile {
  platform: DashLocalModelsPlatform;
  vramGb: number;
  ramGb: number;
  bandwidthGbps: number;
  /** GPU marketing name; absent on CPU-only hosts. */
  gpuName?: string;
  cpuName: string;
  detectedAt: string;
}

/**
 * Mirror of `PoolEntry` (`packages/local-models/src/pool/types.ts`).
 * Steady-state, persisted fields only.
 */
export interface DashPoolEntry {
  ollamaName: string;
  hfRepoId: string;
  sizeOnDiskGb: number;
  installedAt: string;
  lastUsedAt: string | null;
  currentScore: number;
}

/**
 * Mirror of `PoolEntryView` — a `PoolEntry` with the transient, never-persisted
 * `pendingEviction` overlay (LMLM Phase 7 / S1).
 */
export interface DashPoolEntryView extends DashPoolEntry {
  /** True while an approved eviction is deferred because the model is in use. */
  pendingEviction?: boolean;
}

/** Mirror of `PoolStateView` (`packages/local-models/src/pool/types.ts`). */
export interface DashPoolStateView {
  diskBudgetGb: number;
  /** Derived: sum of `entries.sizeOnDiskGb`. */
  diskUsedGb: number;
  entries: DashPoolEntryView[];
  allowedOrgs: string[];
  allowedFamilies: string[];
  lastRefreshAt: string | null;
}

/**
 * Mirror of the `RankedModel` subset the Recommendations card renders
 * (`packages/local-models/src/ranker/types.ts`). The full VRAM/speed/benchmark
 * breakdown objects are omitted — the panel does not render the "why this
 * score?" tooltip in Phase 8.
 */
export interface DashRankedModel {
  hfRepoId: string;
  ollamaName?: string;
  sizeB: number;
  activeB?: number;
  quant: string;
  estimatedVramGb: number;
  estimatedTokPerSec: number;
  speedConfidence: 'high' | 'medium' | 'low';
  score: number;
  /** Weakest evidence grade among merged contributions. */
  evidence: string;
  benchmarkSnapshot: string;
  fitsHardware: boolean;
}

/**
 * Delta signal broadcast on `local-models:pool` (orchestrator `server/http.ts`).
 * Consumed ONLY as a refetch trigger (D-P8-3) — never merged as state.
 */
export interface LocalModelsPoolEvent {
  action?: 'add' | 'swap' | 'evict';
  phase?: string; // 'evict_completed' | 'evict_deferred' | 'swap_evict_failed' | ...
  evicted?: string;
  deferred?: string;
  id?: string;
}

/**
 * Delta signal broadcast on `local-models:proposal`. Consumed ONLY as a refetch
 * trigger (D-P8-3) — never merged as state.
 */
export interface LocalModelsProposalEvent {
  id: string;
  status?: string; // 'created' | 'approved' | 'rejected' | 'failed_target_missing'
  action?: string;
  target?: string;
}
