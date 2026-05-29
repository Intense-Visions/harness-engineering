/**
 * Benchmark source adapters.
 *
 * Phase 2c seeds the source registry with two adapters behind a common
 * `BenchmarkSource` interface:
 *
 *  - `openLlmLeaderboardSource` — wraps the public Open LLM Leaderboard JSON
 *    endpoint and emits `direct` evidence observations across the leaderboard's
 *    benchmark slugs (`arc`, `mmlu`, …).
 *  - `huggingFacePopularitySource` — turns `downloads + likes × LIKE_WEIGHT`
 *    from the HF `/api/models` list into a synthetic `'hf-popularity'`
 *    benchmark. Popularity is a proxy for community trust; the merge weights
 *    it down via `DEFAULT_SOURCE_WEIGHTS` so it never overrides a real
 *    leaderboard score.
 *
 * Both adapters share three invariants:
 *
 *  1. **Never throw.** Network, schema, and parse failures fold into a
 *     `SourceWarning[]` so the merge's `confidence` label can degrade
 *     gracefully (S4). The orchestrator's frozen snapshot covers the
 *     "nothing fetched at all" floor; these adapters cover the per-source
 *     degradation.
 *  2. **Fetcher injected.** No global `fetch` call. CI mocks the wire; the
 *     production wiring (Phase 6 scheduler) passes the same shape.
 *  3. **Stable observation shape.** Every emitted observation flows into the
 *     evidence grader and the merge unchanged — adapters do the source-
 *     specific normalisation here so the merge stays generic.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (lines 80–87, 414–429; S4 success criterion)
 */

import type { BenchmarkEvidence, BenchmarkObservation } from './types.js';

/** Stable warning codes the merge / orchestrator branch on. */
export type SourceWarningCode = 'fetch_failed' | 'parse_failed' | 'schema_invalid';

/** Structured warning attached to a source result. */
export interface SourceWarning {
  code: SourceWarningCode;
  message: string;
  cause?: string;
}

/** Output envelope of `BenchmarkSource.fetch`. Always populated — never thrown. */
export interface BenchmarkSourceResult {
  /** Mirrors `BenchmarkSource.id` so callers can index results by source. */
  source: string;
  /** Observations the adapter successfully parsed. Empty on failure. */
  observations: BenchmarkObservation[];
  /** Structured warnings for any degraded path the adapter took. */
  warnings: SourceWarning[];
  /** ISO date the adapter ran. Drives the merge's recency math. */
  fetchedAt: string;
}

/**
 * Narrow fetcher seam shared by every source adapter. Production code wraps
 * the global `fetch`; tests inject a deterministic stub. The shape mirrors
 * Phase 2a's `HuggingFaceFetcher` so wiring in Phase 6 can hand one shared
 * fetcher down.
 */
export type Fetcher = (input: {
  url: string;
  init?: { headers?: Record<string, string>; signal?: AbortSignal };
}) => Promise<FetcherResponse>;

/** Narrow response surface the adapters consume. Matches the `fetch` happy path. */
export interface FetcherResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/** Inputs the orchestrator hands the adapter at each refresh tick. */
export interface BenchmarkSourceFetchOptions {
  /** Wall-clock injection seam. Defaults to `Date.now()` behaviour. */
  now?: () => Date;
  /** Outbound HTTP transport. Required — no implicit `fetch` fallback. */
  fetcher: Fetcher;
}

/** Strategy interface every benchmark source implements. */
export interface BenchmarkSource {
  /** Stable id used as both the warning key and the `BenchmarkObservation.source` field. */
  readonly id: string;
  /** One-shot fetch + parse. Never throws; degrades to warnings. */
  fetch(options: BenchmarkSourceFetchOptions): Promise<BenchmarkSourceResult>;
}

/** ISO `YYYY-MM-DD` slice of a `Date`. Shared by both adapters. */
function todayIso(now: () => Date): string {
  return now().toISOString().slice(0, 10);
}

/**
 * Documented URL for the Open LLM Leaderboard's JSON contents endpoint.
 * Constant lives here so retargeting (mirror, staging) is a one-line change.
 */
export const OPEN_LLM_LEADERBOARD_URL =
  'https://huggingface.co/api/datasets/open-llm-leaderboard/contents/v2/leaderboard.json';

/** Documented URL for the HF model list endpoint, filtered to text-generation candidates. */
export const HF_POPULARITY_URL =
  'https://huggingface.co/api/models?filter=text-generation&sort=downloads&limit=100';

/**
 * Per-like multiplier in the popularity composite. Calibrated against the
 * heuristic that "one like reflects roughly fifty downloads of intent" — a
 * like is a stronger signal than a download because the reader chose to
 * endorse the repo. Tunable in one place.
 */
export const LIKE_WEIGHT = 50;

/** Run-time guard rejecting an unknown shape from the leaderboard endpoint. */
interface OpenLlmLeaderboardPayload {
  models: ReadonlyArray<{
    model: string;
    scores: Record<string, number>;
  }>;
}

function isOpenLlmLeaderboardPayload(value: unknown): value is OpenLlmLeaderboardPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as { models?: unknown };
  if (!Array.isArray(v.models)) return false;
  return v.models.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const e = entry as { model?: unknown; scores?: unknown };
    return (
      typeof e.model === 'string' &&
      e.scores !== null &&
      typeof e.scores === 'object' &&
      Object.values(e.scores as Record<string, unknown>).every((s) => typeof s === 'number')
    );
  });
}

/** Run-time guard rejecting an unknown shape from the HF popularity endpoint. */
interface HfPopularityPayloadEntry {
  id: string;
  downloads: number;
  likes: number;
}

function isHfPopularityPayload(value: unknown): value is HfPopularityPayloadEntry[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const e = entry as { id?: unknown; downloads?: unknown; likes?: unknown };
    return (
      typeof e.id === 'string' && typeof e.downloads === 'number' && typeof e.likes === 'number'
    );
  });
}

/**
 * Shared helper turning a thrown fetcher error or a non-2xx status into a
 * structured `fetch_failed` warning. Keeps both adapters identical on the
 * network-degradation path.
 */
async function performFetch(
  fetcher: Fetcher,
  url: string,
  warnings: SourceWarning[]
): Promise<FetcherResponse | null> {
  try {
    const response = await fetcher({ url });
    if (!response.ok) {
      warnings.push({
        code: 'fetch_failed',
        message: `Source returned HTTP ${response.status}`,
        cause: `HTTP ${response.status}`,
      });
      return null;
    }
    return response;
  } catch (error) {
    warnings.push({
      code: 'fetch_failed',
      message: 'Fetcher rejected before delivering a response',
      cause: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Open LLM Leaderboard adapter. Emits one observation per `(model, benchmark)` pair. */
export const openLlmLeaderboardSource: BenchmarkSource = {
  id: 'open-llm-leaderboard',
  async fetch(options): Promise<BenchmarkSourceResult> {
    const now = options.now ?? (() => new Date());
    const fetchedAt = todayIso(now);
    const warnings: SourceWarning[] = [];
    const observations: BenchmarkObservation[] = [];

    const response = await performFetch(options.fetcher, OPEN_LLM_LEADERBOARD_URL, warnings);
    if (!response) {
      return { source: openLlmLeaderboardSource.id, observations, warnings, fetchedAt };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      warnings.push({
        code: 'parse_failed',
        message: 'Response body did not parse as JSON',
        cause: error instanceof Error ? error.message : String(error),
      });
      return { source: openLlmLeaderboardSource.id, observations, warnings, fetchedAt };
    }

    if (!isOpenLlmLeaderboardPayload(payload)) {
      warnings.push({
        code: 'schema_invalid',
        message: 'Response did not match the Open LLM Leaderboard schema',
      });
      return { source: openLlmLeaderboardSource.id, observations, warnings, fetchedAt };
    }

    const evidence: BenchmarkEvidence = 'direct';
    for (const entry of payload.models) {
      for (const [benchmark, value] of Object.entries(entry.scores)) {
        observations.push({
          source: openLlmLeaderboardSource.id,
          benchmark,
          value,
          evidence,
          observedAt: fetchedAt,
        });
      }
    }

    return { source: openLlmLeaderboardSource.id, observations, warnings, fetchedAt };
  },
};

/** HF popularity adapter. Emits one synthetic `'hf-popularity'` observation per repo. */
export const huggingFacePopularitySource: BenchmarkSource = {
  id: 'hf-popularity',
  async fetch(options): Promise<BenchmarkSourceResult> {
    const now = options.now ?? (() => new Date());
    const fetchedAt = todayIso(now);
    const warnings: SourceWarning[] = [];
    const observations: BenchmarkObservation[] = [];

    const response = await performFetch(options.fetcher, HF_POPULARITY_URL, warnings);
    if (!response) {
      return { source: huggingFacePopularitySource.id, observations, warnings, fetchedAt };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      warnings.push({
        code: 'parse_failed',
        message: 'Response body did not parse as JSON',
        cause: error instanceof Error ? error.message : String(error),
      });
      return { source: huggingFacePopularitySource.id, observations, warnings, fetchedAt };
    }

    if (!isHfPopularityPayload(payload)) {
      warnings.push({
        code: 'schema_invalid',
        message: 'Response did not match the HF popularity model-list schema',
      });
      return { source: huggingFacePopularitySource.id, observations, warnings, fetchedAt };
    }

    const composites = payload.map((entry) => ({
      id: entry.id,
      composite: entry.downloads + entry.likes * LIKE_WEIGHT,
    }));
    const maxComposite = composites.reduce((m, c) => (c.composite > m ? c.composite : m), 0);

    const evidence: BenchmarkEvidence = 'interpolated';
    for (const entry of composites) {
      const value = maxComposite > 0 ? (entry.composite / maxComposite) * 100 : 0;
      observations.push({
        source: huggingFacePopularitySource.id,
        benchmark: 'hf-popularity',
        value,
        evidence,
        observedAt: fetchedAt,
      });
    }

    return { source: huggingFacePopularitySource.id, observations, warnings, fetchedAt };
  },
};
