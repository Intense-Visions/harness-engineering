/**
 * `PoolManager` — high-level orchestrator over the pool state, the eviction
 * planner, and an install adapter.
 *
 * The manager is the single entrypoint later phases consume:
 *   - Phase 4 `LocalModelResolver` reads `snapshot()` to derive its candidate
 *     list and calls `markUsed()` on each resolved dispatch.
 *   - Phase 5b proposal engine calls `install` / `evict` when the operator
 *     approves a `ModelProposal`, and `isAllowed` to pre-filter candidates.
 *   - Phase 6 scheduler calls `reconcile()` each tick to honor D12 drift, and
 *     `updateScores()` after each re-rank.
 *   - Phase 7 CLI calls `configurePool` for `pool {set-budget, allow-org, allow-family}`
 *     and `install` / `evict` for the direct operator-driven path.
 *
 * Every method funnels mutations through `PoolStateStore.update` so the
 * derived `diskUsedGb` stays honest (S5) and the on-disk record is atomically
 * persisted (O2 via Phase 3a). The manager owns no I/O of its own — the
 * injected `PoolStateStore` does the persistence and the injected
 * `InstallAdapter` does the transport.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md
 *      Phase 3 (lines 431–443); F4, F5, F8 (allowlist), S2, S5, S6, S7,
 *      D1 (pool-bounded autonomy), D12 (silent drift reconciliation),
 *      D13 (stale-target cancellation)
 */

import type {
  EvictRequest,
  InstallAdapter,
  InstallEvent,
  InstallErrorCode,
  InstallRequest,
  InstallResult,
  InspectRequest,
  RemoteModelInfo,
} from '../installer/index.js';
import { isInstallError } from '../installer/index.js';
import { planEviction } from './eviction.js';
import type { PoolStateStore } from './state.js';
import type { PoolEntry, PoolState } from './types.js';

/**
 * Stable error codes the manager surfaces. Extends Phase 3b's `InstallErrorCode`
 * with two pool-layer codes the installer alone can't produce: `not_allowed`
 * (allowlist veto) and `budget_exceeded` (no eviction plan can satisfy the ask).
 */
export type PoolManagerErrorCode = InstallErrorCode | 'not_allowed' | 'budget_exceeded';

/** Constructor inputs. */
export interface PoolManagerOptions {
  /** Phase 3a persistence layer. The manager assumes `load()` was awaited. */
  store: PoolStateStore;
  /** Phase 3b install adapter. The null adapter is a valid stand-in for tests. */
  installer: InstallAdapter;
  /** Clock for stamping `installedAt` / `lastUsedAt`. Defaults to `Date.now`. */
  now?: () => number;
  /** Optional structured logger; defaults to a silent no-op. */
  onWarn?: (message: string, cause?: unknown) => void;
}

/** Inputs to `install`. The HF repo id is the source of allowlist truth (D1). */
export interface InstallPoolRequest {
  hfRepoId: string;
  ollamaName: string;
  /**
   * Optional pre-resolved disk size. When supplied the manager skips
   * `installer.inspect` (Phase 5b's proposal engine prefers this path — it
   * already has the size from the ranker).
   */
  sizeOnDiskGb?: number;
  /**
   * Optional family slug for the allowlist check. Required when `allowedFamilies`
   * is non-empty; ignored otherwise.
   */
  family?: string;
  /** Initial ranker score for the new pool entry. Defaults to 0. */
  initialScore?: number;
  /** Caller-supplied cancellation signal. */
  signal?: AbortSignal;
  /** Streaming progress callback forwarded to `installer.install`. */
  onEvent?: (event: InstallEvent) => void;
}

/**
 * Discriminated reply for `install`. The `evicted` field carries the entries
 * removed during pre-commit eviction so the caller (Phase 5b proposal engine,
 * Phase 7 CLI) can show the operator what changed.
 */
export type InstallPoolResult =
  | {
      status: 'success';
      entry: PoolEntry;
      evicted: PoolEntry[];
      /** True when the manager found a matching entry already in the pool. */
      alreadyInstalled?: boolean;
    }
  | {
      status: 'error';
      code: PoolManagerErrorCode;
      message: string;
      /** Entries already evicted before the failure point, if any. */
      evicted: PoolEntry[];
    };

export interface EvictPoolRequest {
  ollamaName: string;
  signal?: AbortSignal;
}

export type EvictPoolResult =
  | {
      status: 'success';
      name: string;
      removed: PoolEntry | null;
      /** True when the entry was already absent from the pool (no-op). */
      alreadyAbsent?: boolean;
      /** True when the installer reported `not_in_pool` and we treated it as D12 drift. */
      reconciled?: boolean;
    }
  | {
      status: 'error';
      code: InstallErrorCode;
      message: string;
    };

export interface ReconcileRequest {
  signal?: AbortSignal;
}

export interface ReconcileResult {
  removed: PoolEntry[];
}

/** Partial-field updater for the Phase 7 CLI `pool {set-budget, allow-org, allow-family}` flows. */
export interface ConfigurePoolRequest {
  diskBudgetGb?: number;
  allowedOrgs?: string[];
  allowedFamilies?: string[];
}

export interface ScoreUpdate {
  ollamaName: string;
  currentScore: number;
}

export interface AllowCheckRequest {
  hfRepoId: string;
  family?: string;
}

const ISO = (ms: number): string => new Date(ms).toISOString();

export class PoolManager {
  private readonly store: PoolStateStore;
  private readonly installer: InstallAdapter;
  private readonly now: () => number;
  private readonly onWarn: (message: string, cause?: unknown) => void;

  constructor(options: PoolManagerOptions) {
    this.store = options.store;
    this.installer = options.installer;
    this.now = options.now ?? (() => Date.now());
    this.onWarn = options.onWarn ?? (() => undefined);
  }

  /** Frozen clone of the current pool state. Safe to mutate without affecting the store. */
  snapshot(): PoolState {
    return this.store.snapshot();
  }

  /**
   * Pure allowlist check. Org match is case-sensitive (HF registry truth);
   * family match is case-insensitive (operator-typed slug).
   */
  isAllowed(request: AllowCheckRequest): boolean {
    const state = this.store.snapshot();
    const org = orgOf(request.hfRepoId);
    if (org === undefined || !state.allowedOrgs.includes(org)) return false;
    if (state.allowedFamilies.length === 0) return true;
    if (request.family === undefined) return false;
    const family = request.family.toLowerCase();
    return state.allowedFamilies.some((f) => f.toLowerCase() === family);
  }

  /**
   * Install a model into the pool. The flow:
   *
   *   1. Allowlist gate (`not_allowed` if rejected).
   *   2. Idempotent short-circuit (already-installed entries don't pull again).
   *   3. Resolve size via `installer.inspect` when not supplied.
   *   4. Capacity check — if the pool can't fit, plan eviction; if even the
   *      fully-evicted pool can't fit, reject with `budget_exceeded` (S5).
   *   5. Pre-commit eviction — `installer.evict` per planned entry in
   *      lowest-score-LRU order; remove from pool state on each success.
   *   6. `installer.install` — happy path appends a new `PoolEntry`.
   *   7. Persist once at the end.
   */
  async install(request: InstallPoolRequest): Promise<InstallPoolResult> {
    if (
      !this.isAllowed({
        hfRepoId: request.hfRepoId,
        ...(request.family !== undefined ? { family: request.family } : {}),
      })
    ) {
      const reason = this.allowlistReason(request);
      return {
        status: 'error',
        code: 'not_allowed',
        message: `install rejected: ${reason}`,
        evicted: [],
      };
    }

    const existing = this.findEntry(request.ollamaName);
    if (existing) {
      return { status: 'success', entry: existing, evicted: [], alreadyInstalled: true };
    }

    const sizeResult = await this.resolveSizeOnDisk(request);
    if (!sizeResult.ok) return sizeResult.result;
    const sizeOnDiskGb = sizeResult.sizeOnDiskGb;

    const state = this.store.snapshot();
    const evictionResult = await this.precommitEvict(request, sizeOnDiskGb, state);
    if (!evictionResult.ok) return evictionResult.result;

    return this.commitInstall(request, sizeOnDiskGb, evictionResult.evicted);
  }

  /**
   * Resolve the on-disk size for a pending install. Returns the caller-supplied
   * size when present, otherwise queries `installer.inspect`. A transport
   * failure is mapped to an `install` error reply rather than thrown.
   */
  private async resolveSizeOnDisk(
    request: InstallPoolRequest
  ): Promise<{ ok: true; sizeOnDiskGb: number } | { ok: false; result: InstallPoolResult }> {
    if (request.sizeOnDiskGb !== undefined) {
      return { ok: true, sizeOnDiskGb: request.sizeOnDiskGb };
    }
    try {
      const inspectRequest: InspectRequest = {
        name: request.ollamaName,
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
      };
      const info = await this.installer.inspect(inspectRequest);
      return { ok: true, sizeOnDiskGb: info.sizeOnDiskGb };
    } catch (err) {
      const code: InstallErrorCode = isInstallError(err) ? err.code : 'installer_unavailable';
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        result: {
          status: 'error',
          code,
          message: `installer.inspect failed for ${request.ollamaName}: ${message}`,
          evicted: [],
        },
      };
    }
  }

  /**
   * Capacity check + pre-commit eviction (S5). When the pool already has room
   * the returned `evicted` list is empty. If even the fully-evicted pool can't
   * fit, returns a `budget_exceeded` error reply.
   */
  private async precommitEvict(
    request: InstallPoolRequest,
    sizeOnDiskGb: number,
    state: PoolState
  ): Promise<{ ok: true; evicted: PoolEntry[] } | { ok: false; result: InstallPoolResult }> {
    const evicted: PoolEntry[] = [];
    const available = state.diskBudgetGb - state.diskUsedGb;
    if (sizeOnDiskGb <= available) return { ok: true, evicted };

    const deficit = sizeOnDiskGb - available;
    const plan = planEviction({ state, freeBudgetGb: deficit });
    if (plan.remainingNeededGb > 0) {
      return {
        ok: false,
        result: {
          status: 'error',
          code: 'budget_exceeded',
          message: `install ${request.ollamaName} would exceed disk budget by ${plan.remainingNeededGb.toFixed(2)} GB after maximal eviction`,
          evicted: [],
        },
      };
    }
    for (const candidate of plan.evict) {
      const failure = await this.evictCandidate(candidate, request.signal, evicted);
      if (failure !== undefined) return { ok: false, result: failure };
    }
    return { ok: true, evicted };
  }

  /**
   * Evict a single planned candidate during pre-commit. On success (or D12
   * `not_in_pool` reconciliation) the entry is dropped from pool state and
   * pushed onto `evicted`, and `undefined` is returned to continue the loop.
   * Any other outcome returns the `install` error reply to abort.
   */
  private async evictCandidate(
    candidate: PoolEntry,
    signal: AbortSignal | undefined,
    evicted: PoolEntry[]
  ): Promise<InstallPoolResult | undefined> {
    const evictRequest: EvictRequest = {
      name: candidate.ollamaName,
      ...(signal !== undefined ? { signal } : {}),
    };
    let result: InstallResult;
    try {
      result = await this.installer.evict(evictRequest);
    } catch (err) {
      const code: InstallErrorCode = isInstallError(err) ? err.code : 'installer_unavailable';
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'error',
        code,
        message: `pre-commit evict failed for ${candidate.ollamaName}: ${message}`,
        evicted,
      };
    }
    if (result.status === 'error') {
      if (result.code === 'not_in_pool') {
        // Installer already lost the entry — D12 reconciliation. Treat as success
        // for budget purposes and drop the entry from pool state.
        this.removeEntry(candidate.ollamaName);
        evicted.push(candidate);
        return undefined;
      }
      return {
        status: 'error',
        code: result.code,
        message: `pre-commit evict failed for ${candidate.ollamaName}: ${result.message}`,
        evicted,
      };
    }
    this.removeEntry(candidate.ollamaName);
    evicted.push(candidate);
    return undefined;
  }

  /**
   * Final install step: invoke `installer.install`, handle the error paths
   * (S7 partial-byte cleanup on `install_failed`), and on success append the
   * new `PoolEntry` and persist once.
   */
  private async commitInstall(
    request: InstallPoolRequest,
    sizeOnDiskGb: number,
    evicted: PoolEntry[]
  ): Promise<InstallPoolResult> {
    const installRequest: InstallRequest = {
      name: request.ollamaName,
      ...(request.signal !== undefined ? { signal: request.signal } : {}),
      ...(request.onEvent !== undefined ? { onEvent: request.onEvent } : {}),
    };
    let installResult: InstallResult;
    try {
      installResult = await this.installer.install(installRequest);
    } catch (err) {
      const code: InstallErrorCode = isInstallError(err) ? err.code : 'installer_unavailable';
      const message = err instanceof Error ? err.message : String(err);
      await this.maybePersist(evicted.length > 0);
      return {
        status: 'error',
        code,
        message: `installer.install threw for ${request.ollamaName}: ${message}`,
        evicted,
      };
    }

    if (installResult.status === 'error') {
      // S7: best-effort partial-byte cleanup on `install_failed`. S6 + D13 do not
      // trigger cleanup (the installer is down or the target never existed).
      if (installResult.code === 'install_failed') {
        await this.bestEffortCleanup(request.ollamaName, request.signal);
      }
      await this.maybePersist(evicted.length > 0);
      return {
        status: 'error',
        code: installResult.code,
        message: installResult.message,
        evicted,
      };
    }

    const entry: PoolEntry = {
      ollamaName: request.ollamaName,
      hfRepoId: request.hfRepoId,
      sizeOnDiskGb,
      installedAt: ISO(this.now()),
      lastUsedAt: null,
      currentScore: request.initialScore ?? 0,
    };
    this.store.update((draft) => ({
      ...draft,
      entries: [...draft.entries, entry],
    }));
    await this.store.persist();
    return { status: 'success', entry, evicted };
  }

  /**
   * Evict a model from the pool. The installer is invoked first; the pool
   * state mutates only after a successful (or D12-reconciled) reply. S6 keeps
   * the operator's record intact when the installer is unreachable.
   */
  async evict(request: EvictPoolRequest): Promise<EvictPoolResult> {
    const existing = this.findEntry(request.ollamaName);
    if (!existing) {
      return { status: 'success', name: request.ollamaName, removed: null, alreadyAbsent: true };
    }
    const evictRequest: EvictRequest = {
      name: request.ollamaName,
      ...(request.signal !== undefined ? { signal: request.signal } : {}),
    };
    let result: InstallResult;
    try {
      result = await this.installer.evict(evictRequest);
    } catch (err) {
      const code: InstallErrorCode = isInstallError(err) ? err.code : 'installer_unavailable';
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'error', code, message };
    }
    if (result.status === 'error') {
      if (result.code === 'not_in_pool') {
        // D12: installer disagrees, treat as silent reconciliation.
        this.removeEntry(request.ollamaName);
        await this.store.persist();
        return {
          status: 'success',
          name: request.ollamaName,
          removed: existing,
          reconciled: true,
        };
      }
      return { status: 'error', code: result.code, message: result.message };
    }
    this.removeEntry(request.ollamaName);
    await this.store.persist();
    return { status: 'success', name: request.ollamaName, removed: existing };
  }

  /**
   * Drift reconciliation (D12): prune pool entries the installer no longer
   * reports. Auto-import is **not** done — that would cross the autonomy
   * boundary (D1). A transport failure leaves pool state untouched so the
   * scheduler's next tick can retry.
   */
  async reconcile(request: ReconcileRequest = {}): Promise<ReconcileResult> {
    let installed: RemoteModelInfo[];
    try {
      installed = await this.installer.list(
        request.signal !== undefined ? { signal: request.signal } : {}
      );
    } catch (err) {
      this.onWarn('pool reconcile failed: installer.list threw', err);
      return { removed: [] };
    }

    const installedNames = new Set(installed.map((info) => info.ollamaName));
    const state = this.store.snapshot();
    const removed = state.entries.filter((entry) => !installedNames.has(entry.ollamaName));
    if (removed.length === 0) return { removed: [] };

    this.store.update((draft) => ({
      ...draft,
      entries: draft.entries.filter((entry) => installedNames.has(entry.ollamaName)),
    }));
    await this.store.persist();
    for (const entry of removed) {
      this.onWarn(`pool reconcile removed ${entry.ollamaName} (no longer present on installer)`);
    }
    return { removed };
  }

  /** Record a resolver hit on a pool entry. No-op if the entry is unknown. */
  async markUsed(ollamaName: string): Promise<void> {
    if (!this.findEntry(ollamaName)) return;
    const ts = ISO(this.now());
    this.store.update((draft) => ({
      ...draft,
      entries: draft.entries.map((entry) =>
        entry.ollamaName === ollamaName ? { ...entry, lastUsedAt: ts } : entry
      ),
    }));
    await this.store.persist();
  }

  /** Batched score rewrite. Persists once. Ignores unknown names. */
  async updateScores(updates: ScoreUpdate[]): Promise<void> {
    if (updates.length === 0) return;
    const lookup = new Map(updates.map((u) => [u.ollamaName, u.currentScore]));
    const state = this.store.snapshot();
    const anyMatch = state.entries.some((entry) => lookup.has(entry.ollamaName));
    if (!anyMatch) return;
    this.store.update((draft) => ({
      ...draft,
      entries: draft.entries.map((entry) =>
        lookup.has(entry.ollamaName)
          ? { ...entry, currentScore: lookup.get(entry.ollamaName) as number }
          : entry
      ),
    }));
    await this.store.persist();
  }

  /** Partial pool-config update for the Phase 7 CLI pool subcommands. */
  async configurePool(config: ConfigurePoolRequest): Promise<PoolState> {
    this.store.update((draft) => {
      const next: PoolState = { ...draft };
      if (config.diskBudgetGb !== undefined) next.diskBudgetGb = config.diskBudgetGb;
      if (config.allowedOrgs !== undefined) next.allowedOrgs = [...config.allowedOrgs];
      if (config.allowedFamilies !== undefined) next.allowedFamilies = [...config.allowedFamilies];
      return next;
    });
    await this.store.persist();
    return this.store.snapshot();
  }

  private findEntry(ollamaName: string): PoolEntry | undefined {
    return this.store.snapshot().entries.find((entry) => entry.ollamaName === ollamaName);
  }

  private removeEntry(ollamaName: string): void {
    this.store.update((draft) => ({
      ...draft,
      entries: draft.entries.filter((entry) => entry.ollamaName !== ollamaName),
    }));
  }

  private async maybePersist(dirty: boolean): Promise<void> {
    if (dirty) await this.store.persist();
  }

  /**
   * Best-effort partial-byte cleanup after S7's `install_failed`. The
   * follow-up `evict` failure is swallowed — the manager cannot do more.
   */
  private async bestEffortCleanup(name: string, signal: AbortSignal | undefined): Promise<void> {
    try {
      await this.installer.evict({ name, ...(signal !== undefined ? { signal } : {}) });
    } catch (err) {
      this.onWarn(`partial-byte cleanup failed for ${name}`, err);
    }
  }

  private allowlistReason(request: InstallPoolRequest): string {
    const state = this.store.snapshot();
    const org = orgOf(request.hfRepoId);
    if (org === undefined) return `hfRepoId ${request.hfRepoId} has no recognizable org segment`;
    if (!state.allowedOrgs.includes(org)) return `org ${org} is not in allowedOrgs`;
    if (state.allowedFamilies.length > 0 && request.family === undefined) {
      return `allowedFamilies is non-empty but request did not specify a family`;
    }
    return `family ${request.family ?? ''} is not in allowedFamilies`;
  }
}

/** First segment of a HuggingFace repo id. Returns undefined when the id is malformed. */
function orgOf(hfRepoId: string): string | undefined {
  const slash = hfRepoId.indexOf('/');
  if (slash <= 0) return undefined;
  return hfRepoId.slice(0, slash);
}
