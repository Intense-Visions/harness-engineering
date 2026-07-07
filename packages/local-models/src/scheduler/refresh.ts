/**
 * Background refresh — tick pipeline (Phase 6).
 *
 * `runRefreshTick` is the pure, timer-free composition the scheduler runs each
 * tick. It follows the spec's step order (proposal.md "Background scheduler"):
 *
 *   1. detect hardware
 *   2. recommend (HF, cache TTL, frozen-snapshot fallback) → ranking
 *   3. DRIFT RECONCILE (D12/F10): prune pool entries the installer no longer
 *      reports, freeing their disk budget — done inside `PoolManager.reconcile`
 *   4. diff the reconciled pool against the ranking via the Phase 5b engine
 *   5. emit a `ModelProposal` for each diff over threshold not already
 *      pending/rejected
 *   6. rewrite pool entry scores from the re-rank
 *
 * The pipeline is degradation-first: every stage is wrapped so a failure is
 * recorded on `TickResult.errors` and, where safe, later stages still run. A
 * hardware-detection failure is the one hard stop — without a hardware profile
 * there is nothing to rank against.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 6; D12, F10, O1, O4)
 */

import type { HardwareProfile } from '../hardware/types.js';
import type { PoolEntry } from '../pool/types.js';
import type { ScoreUpdate } from '../pool/manager.js';
import type { RecommendResult } from '../recommender/native.js';
import { diffPoolAgainstRanking, type DedupPair } from '../proposals/engine.js';
import type { ModelProposalContent } from '@harness-engineering/types';

/** Structural slice of `PoolManager` the tick pipeline drives. `PoolManager` satisfies it. */
export interface RefreshTickPool {
  reconcile(request?: { signal?: AbortSignal }): Promise<{ removed: PoolEntry[] }>;
  snapshot(): import('../pool/types.js').PoolState;
  updateScores(updates: ScoreUpdate[]): Promise<void>;
}

/** Suppressed `(target, replaces)` pairs the diff engine must not re-emit (F7). */
export interface DedupPairs {
  pending: DedupPair[];
  rejected: DedupPair[];
}

/** Dependencies for {@link runRefreshTick}. */
export interface RefreshTickDeps {
  /** Hardware profile source (a `HardwareDetector` in production). */
  detectHardware: () => Promise<HardwareProfile>;
  /** Ranking source (a `createNativeRecommender` binding in production). */
  recommend: (hardware: HardwareProfile) => Promise<RecommendResult>;
  /** Pool seam — reconcile, snapshot, and score writeback. */
  poolManager: RefreshTickPool;
  /** Pending/rejected dedup history for F7 suppression. */
  dedupSource: () => Promise<DedupPairs>;
  /** Persist/broadcast one emitted proposal. */
  emitProposal: (content: ModelProposalContent) => Promise<void>;
  /** Minimum score improvement before a swap is proposed. */
  proposalThreshold: number;
  /** VRAM budget forwarded to the justification renderer. Defaults to `hardware.vramGb`. */
  vramGb?: number;
}

/** Structured metrics for one tick — the body of the O1 log line. */
export interface TickResult {
  /** Number of ranked candidates the recommender evaluated. */
  candidatesEvaluated: number;
  /** Number of proposals emitted this tick. */
  proposalsEmitted: number;
  /** `ollamaName`s pruned by drift reconciliation (D12/F10). */
  reconciledRemoved: string[];
  /** Human-readable per-stage errors; empty on a clean tick. */
  errors: string[];
}

/**
 * Run a single refresh tick. Never throws — degraded paths surface through
 * `TickResult.errors`. See the file header for the stage order.
 */
export async function runRefreshTick(deps: RefreshTickDeps): Promise<TickResult> {
  const errors: string[] = [];

  const hardware = await tryStage('hardware detection', errors, () => deps.detectHardware());
  if (hardware === undefined) {
    return { candidatesEvaluated: 0, proposalsEmitted: 0, reconciledRemoved: [], errors };
  }

  const rec = await tryStage('recommend', errors, () => deps.recommend(hardware));
  const ranked = rec?.ranked ?? [];

  const reconcile = await tryStage('reconcile', errors, () => deps.poolManager.reconcile());
  const reconciledRemoved = (reconcile?.removed ?? []).map((e) => e.ollamaName);

  const proposalsEmitted = await emitDiff(deps, hardware, ranked, errors);
  await writeBackScores(deps, ranked, errors);

  return { candidatesEvaluated: ranked.length, proposalsEmitted, reconciledRemoved, errors };
}

/**
 * Diff the reconciled pool against the ranking and emit each proposal. Returns
 * the count actually emitted; a per-proposal emit failure is isolated so the
 * remaining proposals still emit.
 */
async function emitDiff(
  deps: RefreshTickDeps,
  hardware: HardwareProfile,
  ranked: RecommendResult['ranked'],
  errors: string[]
): Promise<number> {
  const dedup = (await tryStage('dedup source', errors, () => deps.dedupSource())) ?? {
    pending: [],
    rejected: [],
  };
  const proposals =
    tryStageSync('diff', errors, () =>
      diffPoolAgainstRanking({
        pool: deps.poolManager.snapshot(),
        ranked,
        proposalThreshold: deps.proposalThreshold,
        vramGb: deps.vramGb ?? hardware.vramGb,
        pending: dedup.pending,
        rejected: dedup.rejected,
      })
    ) ?? [];

  let emitted = 0;
  for (const content of proposals) {
    try {
      await deps.emitProposal(content);
      emitted++;
    } catch (err) {
      errors.push(`emit ${content.target.ollamaName}: ${messageOf(err)}`);
    }
  }
  return emitted;
}

/** Rewrite pool entry scores from the re-rank (matched by `ollamaName`). */
async function writeBackScores(
  deps: RefreshTickDeps,
  ranked: RecommendResult['ranked'],
  errors: string[]
): Promise<void> {
  const byName = new Map(ranked.map((m) => [m.ollamaName, m.score]));
  const updates: ScoreUpdate[] = [];
  for (const entry of deps.poolManager.snapshot().entries) {
    const score = byName.get(entry.ollamaName);
    if (score !== undefined) updates.push({ ollamaName: entry.ollamaName, currentScore: score });
  }
  if (updates.length === 0) return;
  await tryStage('updateScores', errors, () => deps.poolManager.updateScores(updates));
}

/** Await `fn`, recording any throw on `errors` and returning `undefined` on failure. */
async function tryStage<T>(
  label: string,
  errors: string[],
  fn: () => Promise<T>
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    errors.push(`${label}: ${messageOf(err)}`);
    return undefined;
  }
}

/** Synchronous variant of {@link tryStage}. */
function tryStageSync<T>(label: string, errors: string[], fn: () => T): T | undefined {
  try {
    return fn();
  } catch (err) {
    errors.push(`${label}: ${messageOf(err)}`);
    return undefined;
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
