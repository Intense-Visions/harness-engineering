import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  isTickHardFailure,
  type TickResult,
  type PoolState,
  type PoolStateView,
  type HardwareProfile,
  type RankedModel,
} from '@harness-engineering/local-models';
import type { Proposal } from '@harness-engineering/types';

/**
 * Phase 6 — `POST /api/v1/local-models/refresh` (force-refresh).
 *
 * Runs a single {@link RefreshScheduler.forceRefresh} tick out of band and
 * returns the proposals it emitted plus any warnings. This is the HTTP twin of
 * the `harness models refresh` CLI and carries the same O4 exit signal:
 *
 *  - `getRefreshScheduler()` null → LMLM is disabled → `503`.
 *  - Tick is an O4 hard failure (HF unreachable **and** no frozen snapshot) →
 *    `503`, so the CLI maps it to a non-zero exit.
 *  - Otherwise `200 { emitted, proposals, warnings }` — a tick that merely lost
 *    HF but kept the snapshot is a soft success (warnings, exit 0).
 *
 * Scope enforcement lives upstream in `v1-bridge-routes.ts`; this dispatcher is
 * business logic only.
 *
 * Phase 7 adds the read surface — `GET /api/v1/local-models/{hardware,pool,
 * recommendations,proposals}` — dispatched from the same handler. Each returns
 * `503 { error: 'LMLM disabled' }` when its accessor is absent/null and `200`
 * with the resolved payload otherwise; `recommendations` validates `top`
 * (positive int) and `profile` (enum) with a `400` on bad input. The `/proposals`
 * feed is kind-scoped (model-only, open) by the orchestrator accessor.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 6; O4 / Phase 7)
 */

const REFRESH_RE = /^\/api\/v1\/local-models\/refresh(?:\?.*)?$/;
const CANDIDATES_REFRESH_RE = /^\/api\/v1\/local-models\/candidates\/refresh(?:\?.*)?$/;

// ── Phase 7 read routes ── (anchored; tolerate an optional query string)
const HARDWARE_RE = /^\/api\/v1\/local-models\/hardware(?:\?.*)?$/;
const POOL_RE = /^\/api\/v1\/local-models\/pool(?:\?.*)?$/;
const RECS_RE = /^\/api\/v1\/local-models\/recommendations(?:\?.*)?$/;
const PROPOSALS_RE = /^\/api\/v1\/local-models\/proposals(?:\?.*)?$/;

const RECOMMENDATION_PROFILES = ['general', 'coding', 'reasoning'] as const;
type RecommendationProfile = (typeof RECOMMENDATION_PROFILES)[number];

/** The force-refresh seam — `RefreshScheduler` satisfies it. */
export interface RefreshSchedulerOps {
  forceRefresh(): Promise<TickResult>;
}

/**
 * The read-only pool seam. `PoolManager` satisfies it; `viewState()` overlays
 * transient `pendingEviction` flags (Phase 7 Task 8) and falls back to
 * `snapshot()` when absent.
 */
export interface PoolReadOps {
  snapshot(): PoolState;
  /**
   * Runtime view of the pool with the transient `pendingEviction` overlay
   * (Phase 7 Task 8/S1). Entries mid-deferred-eviction carry
   * `pendingEviction: true` so the dashboard/CLI can surface a "swap waiting to
   * drain" state. Absent on managers that predate the overlay → `snapshot()`.
   */
  viewState?: () => PoolStateView;
}

export interface V1LocalModelsDeps {
  /** Returns the live scheduler, or null when LMLM is disabled. */
  getRefreshScheduler: () => RefreshSchedulerOps | null;
  /** Reads the current model-proposal queue (open proposals) for the response body. */
  listModelProposals?: () => Promise<Proposal[]>;
  /** Returns the live pool (view-overlaid) or null when LMLM is disabled. */
  getModelPool?: () => PoolReadOps | null;
  /** Resolves the current hardware profile, or null when LMLM is disabled. */
  getHardwareProfile?: () => Promise<HardwareProfile> | null;
  /** Ranks candidate models for the current hardware (empty until the Phase 2 candidate parser lands). */
  getRecommendations?: (opts: {
    top: number;
    profile: RecommendationProfile;
  }) => Promise<RankedModel[]>;
  /**
   * Live HuggingFace candidate refresh: re-discovers installable candidates,
   * re-seeds the recommender, and re-ranks. Returns null when LMLM is disabled.
   */
  getRefreshCandidates?: () => (() => Promise<{ source: 'frozen' | 'live'; count: number }>) | null;
}

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Dispatch `POST /api/v1/local-models/refresh`. Returns `true` when this module
 * owns the request (so the route table stops), `false` otherwise (fall-through
 * to the chat-proxy fallback).
 */
export function handleV1LocalModelsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  deps: V1LocalModelsDeps
): boolean {
  const url = req.url ?? '';
  const method = req.method ?? 'GET';

  if (method === 'GET') {
    if (HARDWARE_RE.test(url)) {
      void runGet(res, () => handleHardware(res, deps));
      return true;
    }
    if (POOL_RE.test(url)) {
      void runGet(res, () => handlePool(res, deps));
      return true;
    }
    if (RECS_RE.test(url)) {
      void runGet(res, () => handleRecommendations(res, url, deps));
      return true;
    }
    if (PROPOSALS_RE.test(url)) {
      void runGet(res, () => handleProposals(res, deps));
      return true;
    }
    return false;
  }

  if (method !== 'POST') return false;

  // POST /candidates/refresh — pull fresh candidates from HuggingFace, re-seed,
  // and re-rank. Checked before /refresh (distinct anchored routes).
  if (CANDIDATES_REFRESH_RE.test(url)) {
    const refresh = deps.getRefreshCandidates?.() ?? null;
    if (refresh === null) {
      sendJSON(res, 503, { error: 'LMLM disabled' });
      return true;
    }
    void runCandidatesRefresh(res, refresh);
    return true;
  }

  if (!REFRESH_RE.test(url)) return false;

  const scheduler = deps.getRefreshScheduler();
  if (scheduler === null) {
    sendJSON(res, 503, { error: 'LMLM disabled' });
    return true;
  }

  void runForceRefresh(res, scheduler, deps);
  return true;
}

/** Run a live candidate refresh and return its `{ source, count }` result. */
async function runCandidatesRefresh(
  res: ServerResponse,
  refresh: () => Promise<{ source: 'frozen' | 'live'; count: number }>
): Promise<void> {
  try {
    sendJSON(res, 200, await refresh());
  } catch (err) {
    sendJSON(res, 500, {
      error: 'candidate refresh failed',
      detail: err instanceof Error ? err.message : 'unknown',
    });
  }
}

/** Run a GET handler, mapping any thrown error to a `500 { error, detail }`. */
async function runGet(res: ServerResponse, handler: () => Promise<void>): Promise<void> {
  try {
    await handler();
  } catch (err) {
    sendJSON(res, 500, {
      error: 'local-models route failed',
      detail: err instanceof Error ? err.message : 'unknown',
    });
  }
}

async function handleHardware(res: ServerResponse, deps: V1LocalModelsDeps): Promise<void> {
  const pending = deps.getHardwareProfile?.() ?? null;
  if (pending === null) {
    sendJSON(res, 503, { error: 'LMLM disabled' });
    return;
  }
  sendJSON(res, 200, await pending);
}

async function handlePool(res: ServerResponse, deps: V1LocalModelsDeps): Promise<void> {
  const pool = deps.getModelPool?.() ?? null;
  if (pool === null) {
    sendJSON(res, 503, { error: 'LMLM disabled' });
    return;
  }
  // `viewState()` overlays transient pendingEviction flags (Task 8); fall back
  // to the persisted snapshot when the manager predates the overlay.
  sendJSON(res, 200, pool.viewState?.() ?? pool.snapshot());
}

/**
 * Upper bound on `top` (P7-SUG-RECS-VALIDATION-ORDER). `ranked.slice(0, top)` is
 * harmless while the candidate set is empty (pre-Phase-2), but an unbounded `top`
 * is a latent unbounded-response once candidates exist. Cap it so a single request
 * can never ask for more than a page of recommendations.
 */
const MAX_RECOMMENDATION_TOP = 100;

async function handleRecommendations(
  res: ServerResponse,
  url: string,
  deps: V1LocalModelsDeps
): Promise<void> {
  // Disabled → 503 BEFORE input validation, so a disabled instance answers
  // consistently with the other 3 GETs (P7-SUG-RECS-VALIDATION-ORDER) rather
  // than leaking a 400 for bad params it will never actually service.
  if (deps.getRecommendations === undefined) {
    sendJSON(res, 503, { error: 'LMLM disabled' });
    return;
  }

  const params = new URLSearchParams(url.split('?')[1] ?? '');

  const topRaw = params.get('top');
  let top = 10;
  if (topRaw !== null) {
    const n = Number(topRaw);
    if (!Number.isInteger(n) || n <= 0) {
      sendJSON(res, 400, { error: 'invalid top: expected a positive integer' });
      return;
    }
    if (n > MAX_RECOMMENDATION_TOP) {
      sendJSON(res, 400, { error: `invalid top: exceeds maximum of ${MAX_RECOMMENDATION_TOP}` });
      return;
    }
    top = n;
  }

  const profileRaw = params.get('profile');
  let profile: RecommendationProfile = 'general';
  if (profileRaw !== null) {
    if (!isRecommendationProfile(profileRaw)) {
      sendJSON(res, 400, {
        error: `invalid profile: expected one of ${RECOMMENDATION_PROFILES.join(', ')}`,
      });
      return;
    }
    profile = profileRaw;
  }

  sendJSON(res, 200, await deps.getRecommendations({ top, profile }));
}

async function handleProposals(res: ServerResponse, deps: V1LocalModelsDeps): Promise<void> {
  if (deps.listModelProposals === undefined) {
    sendJSON(res, 503, { error: 'LMLM disabled' });
    return;
  }
  sendJSON(res, 200, await deps.listModelProposals());
}

function isRecommendationProfile(value: string): value is RecommendationProfile {
  return (RECOMMENDATION_PROFILES as readonly string[]).includes(value);
}

async function runForceRefresh(
  res: ServerResponse,
  scheduler: RefreshSchedulerOps,
  deps: V1LocalModelsDeps
): Promise<void> {
  let result: TickResult;
  try {
    result = await scheduler.forceRefresh();
  } catch (err) {
    sendJSON(res, 500, {
      error: 'refresh tick failed',
      detail: err instanceof Error ? err.message : 'unknown',
    });
    return;
  }

  // O4 hard failure → 503 so the CLI exits non-zero.
  if (isTickHardFailure(result)) {
    sendJSON(res, 503, {
      error: 'refresh hard failure: HuggingFace unreachable and no benchmark snapshot loaded',
      emitted: result.proposalsEmitted,
      warnings: result.warnings,
      errors: result.errors,
    });
    return;
  }

  const proposals = deps.listModelProposals ? await deps.listModelProposals() : [];
  sendJSON(res, 200, {
    emitted: result.proposalsEmitted,
    reconciledRemoved: result.reconciledRemoved,
    proposals,
    warnings: result.warnings,
  });
}
