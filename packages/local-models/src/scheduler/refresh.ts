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
          proposalsEmitted: 0,
          reconciledRemoved: [],
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
      proposalsEmitted: result.proposalsEmitted,
      errors: result.errors,
    });
  }
}
