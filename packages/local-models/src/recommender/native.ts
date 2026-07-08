/**
 * Native recommender seam (Phase 6).
 *
 * The scheduler needs a single `recommend(hardware)` call that turns the
 * operator's candidate set into a hardware-aware ranking each tick. Phase 2's
 * live-HF candidate parser (arbitrary HF model → `RankerCandidate` with
 * `sizeB`/`quant` extracted from the GGUF manifest) was never built, so this
 * seam takes the candidate list **explicitly** (frozen-snapshot- or
 * config-derived) rather than discovering brand-new HF models autonomously —
 * autonomous discovery is deferred to the Phase 2 recommender completion.
 *
 * The recommender is degradation-first (S4/O4):
 *  - The benchmark snapshot loads via `loadFrozenSnapshot` (the offline
 *    fallback). If the loader throws, we surface an empty ranking with a
 *    warning — the O4 hard-failure signal the force-refresh path maps to a
 *    non-zero exit / 503.
 *  - HF popularity is a best-effort reachability probe wrapped in try/catch:
 *    it never throws and only sets `hfReachable`. HF being down is not fatal
 *    as long as the frozen snapshot loaded.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 6; O4, S4)
 */

import type { HardwareProfile } from '../hardware/types.js';
import type { HuggingFaceClient } from '../huggingface/index.js';
import { loadFrozenSnapshot } from '../ranker/benchmarks/index.js';
import type { BenchmarkSnapshotLoadResult } from '../ranker/benchmarks/index.js';
import { rankModels } from '../ranker/algorithm.js';
import type { RankedModel, RankerCandidate } from '../ranker/types.js';

/** Result of a single {@link createNativeRecommender} recommendation. */
export interface RecommendResult {
  /** Hardware-scored candidates, sorted by descending score. Empty on hard failure. */
  ranked: RankedModel[];
  /** True when a real (non-fallback) benchmark snapshot was loaded. */
  snapshotLoaded: boolean;
  /** True when the best-effort HuggingFace popularity probe succeeded. */
  hfReachable: boolean;
  /** Human-readable warnings accumulated across snapshot load, HF probe, and ranking. */
  warnings: string[];
}

/** The subset of {@link HuggingFaceClient} the recommender probes for reachability. */
type HfReachabilityProbe = Pick<HuggingFaceClient, 'listModels'>;

/** Dependencies for {@link createNativeRecommender}. */
export interface NativeRecommenderDeps {
  /** Explicit candidate set to rank (snapshot- or config-derived). */
  candidates: readonly RankerCandidate[];
  /** Snapshot loader seam. Defaults to {@link loadFrozenSnapshot}. */
  loadSnapshot?: typeof loadFrozenSnapshot;
  /** Optional HF client for the best-effort popularity/reachability probe. */
  hfClient?: HfReachabilityProbe;
}

/**
 * Build a `recommend(hardware)` function that ranks `deps.candidates` against
 * the frozen benchmark snapshot. Never throws — degraded paths surface through
 * `RecommendResult.warnings` and the `snapshotLoaded` / `hfReachable` flags.
 */
export function createNativeRecommender(
  deps: NativeRecommenderDeps
): (hardware: HardwareProfile) => Promise<RecommendResult> {
  const loadSnapshot = deps.loadSnapshot ?? loadFrozenSnapshot;

  return async (hardware: HardwareProfile): Promise<RecommendResult> => {
    const warnings: string[] = [];

    let load: BenchmarkSnapshotLoadResult;
    try {
      load = await loadSnapshot();
    } catch (err) {
      warnings.push(`benchmark snapshot load failed: ${messageOf(err)}`);
      return { ranked: [], snapshotLoaded: false, hfReachable: false, warnings };
    }
    for (const w of load.warnings) warnings.push(w.message);
    const snapshotLoaded = load.source === 'frozen';

    const hfReachable = await probeHf(deps.hfClient, warnings);

    const rankResult = rankModels({
      hardware,
      candidates: deps.candidates,
      snapshot: load.snapshot,
    });
    for (const w of rankResult.warnings) warnings.push(w.message);

    return { ranked: rankResult.ranked, snapshotLoaded, hfReachable, warnings };
  };
}

/** Best-effort HF reachability probe. Never throws; records a warning on failure. */
async function probeHf(
  hfClient: HfReachabilityProbe | undefined,
  warnings: string[]
): Promise<boolean> {
  if (hfClient === undefined) return false;
  try {
    await hfClient.listModels({ limit: 1 });
    return true;
  } catch (err) {
    warnings.push(`HuggingFace popularity probe failed: ${messageOf(err)}`);
    return false;
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
