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
 *   4. rewrite pool entry scores from the re-rank — BEFORE the diff, so a
 *      freshly-installed member (which enters the pool at `currentScore: 0` until
 *      its first re-rank) is diffed against its real score, not the uninitialized
 *      0. Diffing first produced phantom swaps ("replace a pool member scoring 0")
 *      and inflated `scoreDelta`s on the tick right after an install/swap.
 *   5. diff the reconciled, re-scored pool against the ranking via the Phase 5b
 *      engine
 *   6. emit a `ModelProposal` for each diff over threshold not already
 *      pending/rejected
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
import {
  scoreBuildQuality,
  DEFAULT_HARNESS_FIT_TASKS,
  type HarnessFitRunner,
  type HarnessFitProbeTask,
} from '../capability/harness-fit.js';
import {
  selectProbeTargets,
  isProbeDue,
  probeCacheKey,
  type HarnessFitCacheStore,
  type HarnessFitCacheEntry,
  type ProbeCandidate,
} from '../capability/probe-policy.js';

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
  /**
   * Optional agentic tool-calling probe (a `probeToolCalling` binding over the local endpoint,
   * wired by the composition root). Called ONCE per model whose capability is still unknown
   * (`toolCalling === undefined`) during score writeback, so a build never routes to a text-only
   * model. Absent ⇒ no probing (capability stays unknown ⇒ fail-open in candidate selection).
   */
  probeToolCalling?: (ollamaName: string) => Promise<boolean | undefined>;
  /**
   * Optional harness-fit probe seam (D5). When present AND `config.enabled` AND
   * the cadence is due, the tick probes the benchmark top-N (prefiltered), caches
   * each `buildQuality` by model+version, and re-ranks with those signals threaded
   * in so a narrate-only model sorts below an act-and-converge one. Absent ⇒ the
   * tick behaves byte-identically to before (no probe). FAIL-OPEN throughout: any
   * probe error leaves `buildQuality` undefined ⇒ no ranking effect, and the whole
   * pass is wrapped so it can never break the refresh.
   */
  harnessFit?: HarnessFitProbeDeps;
}

/** Configuration + injected seams for the harness-fit probe pass (D5). */
export interface HarnessFitProbeDeps {
  /** Opt-in switch. `false` (or absent deps) ⇒ no probe ever runs. */
  enabled: boolean;
  /** Probe only the benchmark top-N of the ranked shortlist. Never the full set. */
  topN: number;
  /** Minimum ms between probe passes — the probe runs on a cadence, not every tick. */
  intervalMs: number;
  /** Cache freshness window in ms; a `buildQuality` older than this is re-probed. */
  cacheTtlMs: number;
  /** The injected single-dispatch runner (implemented in orchestrator/CLI, D3). */
  runner: HarnessFitRunner;
  /** The injected buildQuality cache store (disk/in-memory, D5). */
  cache: HarnessFitCacheStore;
  /** Persisted cadence state accessor — when the probe pass last ran. */
  getLastProbeAt: () => Promise<number | undefined>;
  /** Persist the cadence timestamp after a pass runs. */
  setLastProbeAt: (at: number) => Promise<void>;
  /**
   * Re-rank with the freshly-probed `buildQuality` threaded in, keyed by the same
   * {@link probeCacheKey}. Returns a re-ranked shortlist the tick then diffs +
   * scores against. Absent-key ⇒ no buildQuality for that candidate (fail-open).
   */
  reRankWithBuildQuality: (
    hardware: HardwareProfile,
    buildQualityByKey: ReadonlyMap<string, number>
  ) => Promise<RecommendResult>;
  /** Probe task suite. Best-of-1 uses the FIRST task. Defaults to the shipped suite. */
  tasks?: readonly HarnessFitProbeTask[];
  /** Epoch-ms clock. Defaults to `Date.now`. */
  now?: () => number;
}

/** Structured metrics for one tick — the body of the O1 log line. */
export interface TickResult {
  /** Number of ranked candidates the recommender evaluated. */
  candidatesEvaluated: number;
  /**
   * Identifiers (`hfRepoId@quant`) of the candidates evaluated this tick, in
   * ranked order. Surfaced in the O1 log so operators can see *which* models a
   * tick considered, not just how many. Empty on a degraded/hard-failure tick.
   */
  evaluatedCandidates: string[];
  /** Number of proposals emitted this tick. */
  proposalsEmitted: number;
  /** `ollamaName`s pruned by drift reconciliation (D12/F10). */
  reconciledRemoved: string[];
  /**
   * True when a real (non-fallback) benchmark snapshot backed this tick's rank.
   * Threaded from {@link RecommendResult.snapshotLoaded} for the O4 signal.
   */
  snapshotLoaded: boolean;
  /**
   * True when the best-effort HuggingFace reachability probe succeeded.
   * Threaded from {@link RecommendResult.hfReachable} for the O4 signal.
   */
  hfReachable: boolean;
  /** Recommender + per-stage warnings surfaced to the force-refresh caller. */
  warnings: string[];
  /** Human-readable per-stage errors; empty on a clean tick. */
  errors: string[];
}

/**
 * O4 hard-failure predicate: the recommender could neither reach HuggingFace
 * **nor** load a frozen benchmark snapshot, so this tick produced no trustworthy
 * ranking. The force-refresh surfaces (CLI + route) map this to a non-zero exit
 * / `503`; a tick that merely lost HF but kept the snapshot is a soft warning.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 6; O4)
 */
export function isTickHardFailure(result: TickResult): boolean {
  return !result.snapshotLoaded && !result.hfReachable;
}

/**
 * Run a single refresh tick. Never throws — degraded paths surface through
 * `TickResult.errors`. See the file header for the stage order.
 */
export async function runRefreshTick(deps: RefreshTickDeps): Promise<TickResult> {
  const errors: string[] = [];

  const hardware = await tryStage('hardware detection', errors, () => deps.detectHardware());
  if (hardware === undefined) {
    // No hardware profile → no trustworthy ranking. Report as an O4 hard failure.
    return hardFailureTick(errors);
  }

  const rec = await tryStage('recommend', errors, () => deps.recommend(hardware));
  const recFields = recOutcome(rec);
  const { snapshotLoaded, hfReachable, warnings } = recFields;

  // Harness-fit probe pass (D5): fail-open, cadence-gated, top-N-only. Replaces
  // `ranked` with a buildQuality-threaded re-rank when a probe fired; otherwise a
  // no-op returning the original shortlist. Wrapped so it can NEVER break the tick.
  const ranked =
    (await tryStage('harness-fit probe', errors, () =>
      runHarnessFitProbe(deps, hardware, recFields.ranked)
    )) ?? recFields.ranked;

  const reconcile = await tryStage('reconcile', errors, () => deps.poolManager.reconcile());
  const reconciledRemoved = (reconcile?.removed ?? []).map((e) => e.ollamaName);

  // Re-score the pool from this tick's ranking BEFORE diffing, so the diff (and
  // the "replace a pool member scoring N" justification) uses each member's real
  // score rather than the 0 a just-installed member carries until its first
  // re-rank. Diffing first churned the pool with phantom swaps against that 0.
  await writeBackScores(deps, ranked, errors);
  const proposalsEmitted = await emitDiff(deps, hardware, ranked, errors);

  return {
    candidatesEvaluated: ranked.length,
    evaluatedCandidates: ranked.map(candidateId),
    proposalsEmitted,
    reconciledRemoved,
    snapshotLoaded,
    hfReachable,
    warnings,
    errors,
  };
}

/** Stable per-candidate identifier for logging: `hfRepoId@quant` (e.g. `Qwen/Qwen3-32B-GGUF@Q4_K_M`). */
function candidateId(m: RecommendResult['ranked'][number]): string {
  return `${m.hfRepoId}@${m.quant}`;
}

/** A tick that produced no trustworthy ranking (O4 hard failure). */
function hardFailureTick(errors: string[]): TickResult {
  return {
    candidatesEvaluated: 0,
    evaluatedCandidates: [],
    proposalsEmitted: 0,
    reconciledRemoved: [],
    snapshotLoaded: false,
    hfReachable: false,
    warnings: [],
    errors,
  };
}

/**
 * Normalize the recommend stage's outcome. A thrown recommend (`rec` undefined)
 * degrades to a hard failure: empty ranking, no snapshot, HF unreachable.
 */
function recOutcome(rec: RecommendResult | undefined): {
  ranked: RecommendResult['ranked'];
  snapshotLoaded: boolean;
  hfReachable: boolean;
  warnings: string[];
} {
  return {
    ranked: rec?.ranked ?? [],
    snapshotLoaded: rec?.snapshotLoaded ?? false,
    hfReachable: rec?.hfReachable ?? false,
    warnings: [...(rec?.warnings ?? [])],
  };
}

/**
 * The harness-fit probe pass (D5). Cadence-gated, top-N-only, cache-aware, and
 * FAIL-OPEN end to end: it probes the benchmark leaders through the injected
 * runner, maps each result to a `buildQuality`, caches it by model+version, and
 * re-ranks with those signals threaded in so a narrate-only model sorts below an
 * act-and-converge one at equal benchmark score.
 *
 * Returns the re-ranked shortlist when a probe pass ran, or the ORIGINAL
 * `ranked` untouched when the probe is disabled/absent/not-due or nothing was
 * probe-eligible. Any single-probe failure yields `buildQuality: undefined` (no
 * effect); the caller additionally wraps THIS whole function so an unexpected
 * throw still leaves the tick running on the pre-probe ranking.
 */
async function runHarnessFitProbe(
  deps: RefreshTickDeps,
  hardware: HardwareProfile,
  ranked: RecommendResult['ranked']
): Promise<RecommendResult['ranked']> {
  const hf = deps.harnessFit;
  if (hf === undefined || !hf.enabled) return ranked;

  const now = (hf.now ?? Date.now)();
  const lastProbeAt = await hf.getLastProbeAt();
  if (!isProbeDue({ lastProbeAt }, { enabled: hf.enabled, intervalMs: hf.intervalMs, now })) {
    return ranked;
  }

  // Select the probe targets from the benchmark leaders (cost gate + prefilter +
  // cache). `RankedModel` structurally satisfies `ProbeCandidate`.
  const targets = selectProbeTargets(ranked as readonly ProbeCandidate[], {
    topN: hf.topN,
    cache: hf.cache,
    now,
    cacheTtlMs: hf.cacheTtlMs,
  });

  // Mark the pass as run REGARDLESS of how many targets there were — the cadence
  // is "we looked this interval", so an all-cached tick still resets the clock.
  await hf.setLastProbeAt(now);
  if (targets.length === 0) return ranked;

  // Best-of-1 (D6): one contained task per candidate — the FIRST of the suite.
  const task = (hf.tasks ?? DEFAULT_HARNESS_FIT_TASKS)[0];
  if (task === undefined) return ranked;

  const buildQualityByKey = new Map<string, number>();
  for (const target of targets) {
    const model = target.ollamaName ?? target.hfRepoId;
    // The runner is fully guarded (D6), but wrap anyway so one throw can't abort
    // the remaining probes; a failure ⇒ buildQuality undefined ⇒ no ranking effect.
    let result;
    try {
      result = await hf.runner.runProbe(model, task);
    } catch {
      result = undefined;
    }
    const buildQuality = result === undefined ? undefined : scoreBuildQuality(result);
    const key = probeCacheKey(target);
    const entry: HarnessFitCacheEntry = { buildQuality, probedAt: now };
    hf.cache.set(key, entry);
    if (buildQuality !== undefined) buildQualityByKey.set(key, buildQuality);
  }

  // Thread the probed buildQuality into a fresh rank. If NOTHING scored (every
  // probe fail-opened), skip the re-rank entirely — the pre-probe ranking stands.
  if (buildQualityByKey.size === 0) return ranked;
  const reRanked = await hf.reRankWithBuildQuality(hardware, buildQualityByKey);
  return reRanked.ranked;
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
  // T14: carry the composite score AND the per-profile score map so a pooled
  // model's task-aware ordering (poolStateToCandidates(state, profile)) reflects
  // the latest re-rank, not a stale/absent profile map.
  const byName = new Map(ranked.map((m) => [m.ollamaName, m]));
  const updates: ScoreUpdate[] = [];
  for (const entry of deps.poolManager.snapshot().entries) {
    const model = byName.get(entry.ollamaName);
    if (model !== undefined) {
      // Probe agentic tool-calling ONCE per model (only while still unknown) — a stable model
      // property, so we never re-probe a decided entry. A probe error leaves it unknown to retry.
      let toolCalling: boolean | undefined;
      if (entry.toolCalling === undefined && deps.probeToolCalling !== undefined) {
        toolCalling = await tryStage(`probeToolCalling ${entry.ollamaName}`, errors, () =>
          deps.probeToolCalling!(entry.ollamaName)
        );
      }
      updates.push({
        ollamaName: entry.ollamaName,
        currentScore: model.score,
        scoresByProfile: { ...model.scoresByProfile },
        ...(toolCalling !== undefined ? { toolCalling } : {}),
      });
    }
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

/** Hard floor on the refresh interval — a tick never fires more than hourly. */
export const MIN_INTERVAL_MS = 3_600_000;

/** Opaque timer handle. The default seam returns a Node `Timeout`; tests fake it. */
export interface SchedulerTimerHandle {
  unref?: () => void;
}

/** Minimal structured logger the scheduler needs. */
export interface SchedulerLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: unknown): void;
}

/** Constructor options for {@link RefreshScheduler}. */
export interface RefreshSchedulerOptions {
  /** The tick body — `runRefreshTick` bound to the orchestrator's deps. */
  runTick: () => Promise<TickResult>;
  /** Base interval in ms. Clamped up to {@link MIN_INTERVAL_MS}. */
  intervalMs: number;
  /** Symmetric jitter in ms applied to each scheduled delay (`±jitterMs`). */
  jitterMs: number;
  /** Structured logger for the O1 tick line. */
  logger: SchedulerLogger;
  /** Timer seam. Defaults to `setTimeout`. */
  setTimer?: (cb: () => void, delayMs: number) => SchedulerTimerHandle;
  /** Timer-clear seam. Defaults to `clearTimeout`. */
  clearTimer?: (handle: SchedulerTimerHandle) => void;
  /** Monotonic clock in ms. Defaults to `Date.now`. */
  now?: () => number;
  /** Uniform `[0, 1)` source for jitter. Defaults to `Math.random`. */
  random?: () => number;
}

/**
 * Single per-instance interval timer that drives {@link runRefreshTick} on a
 * jittered cadence with an overlap guard.
 *
 * The overlap guard mirrors `LocalModelResolver.probeInFlight`: a timer fire or
 * `forceRefresh()` while a tick is already running shares the in-flight promise
 * instead of starting a second, torn-state tick. Each completed tick emits one
 * structured O1 `info` line. The interval is clamped up to {@link MIN_INTERVAL_MS}
 * and jittered by `±jitterMs` so a fleet of instances does not stampede the HF
 * API in lockstep.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 6; O1)
 */
export class RefreshScheduler {
  private readonly runTick: () => Promise<TickResult>;
  private readonly intervalMs: number;
  private readonly jitterMs: number;
  private readonly logger: SchedulerLogger;
  private readonly setTimer: (cb: () => void, delayMs: number) => SchedulerTimerHandle;
  private readonly clearTimer: (handle: SchedulerTimerHandle) => void;
  private readonly now: () => number;
  private readonly random: () => number;

  /** Overlap guard — the currently-running tick, shared by concurrent fires. */
  private tickInFlight: Promise<TickResult> | null = null;
  private handle: SchedulerTimerHandle | null = null;
  private stopped = false;
  private tickCounter = 0;

  constructor(options: RefreshSchedulerOptions) {
    this.runTick = options.runTick;
    this.intervalMs = options.intervalMs;
    this.jitterMs = options.jitterMs;
    this.logger = options.logger;
    this.setTimer =
      options.setTimer ??
      ((cb, delayMs) => setTimeout(cb, delayMs) as unknown as SchedulerTimerHandle);
    this.clearTimer =
      options.clearTimer ??
      ((handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>));
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? (() => Math.random());
  }

  /** Idempotently arm the interval. The first tick fires after the first jittered delay. */
  start(): void {
    if (this.handle !== null) return;
    this.stopped = false;
    this.scheduleNext();
  }

  /** Disarm the interval. Any in-flight tick still resolves; no further ticks are scheduled. */
  stop(): void {
    this.stopped = true;
    if (this.handle !== null) {
      this.clearTimer(this.handle);
      this.handle = null;
    }
  }

  /** Run a tick now (force-refresh path), respecting the overlap guard. */
  forceRefresh(): Promise<TickResult> {
    return this.runGuarded();
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    const delay = this.nextDelay();
    this.handle = this.setTimer(() => {
      this.handle = null;
      void this.runGuarded().finally(() => this.scheduleNext());
    }, delay);
    this.handle.unref?.();
  }

  private nextDelay(): number {
    const base = Math.max(MIN_INTERVAL_MS, this.intervalMs);
    return base + Math.round((this.random() * 2 - 1) * this.jitterMs);
  }

  private runGuarded(): Promise<TickResult> {
    if (this.tickInFlight !== null) return this.tickInFlight;
    const started = this.now();
    const tick = ++this.tickCounter;
    const inFlight = this.runTick()
      .catch(
        (err): TickResult => ({
          candidatesEvaluated: 0,
          evaluatedCandidates: [],
          proposalsEmitted: 0,
          reconciledRemoved: [],
          snapshotLoaded: false,
          hfReachable: false,
          warnings: [],
          errors: [messageOf(err)],
        })
      )
      .then((result) => {
        this.logTick(tick, started, result);
        return result;
      })
      .finally(() => {
        this.tickInFlight = null;
      });
    this.tickInFlight = inFlight;
    return inFlight;
  }

  private logTick(tick: number, started: number, result: TickResult): void {
    const completed = this.now();
    this.logger.info('local-models refresh tick', {
      tick,
      started,
      completed,
      durationMs: completed - started,
      candidatesEvaluated: result.candidatesEvaluated,
      candidates: result.evaluatedCandidates,
      proposalsEmitted: result.proposalsEmitted,
      errors: result.errors,
    });
  }
}
