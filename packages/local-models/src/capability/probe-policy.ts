// packages/local-models/src/capability/probe-policy.ts
//
// The PURE cost-gating POLICY of the harness-fit probe (D5). A harness-fit probe
// is expensive (it pulls + single-dispatches a candidate through the real
// harness), so we NEVER probe the whole discovered set. This module decides
// WHICH benchmark-ranked candidates get probed and WHEN, keyed off:
//
//   - Top-N only  — probe only the benchmark top-N of the ranked shortlist
//                   (default N≈3–5), never the full set.
//   - Prefilter   — skip candidates that don't VRAM-fit and skip
//                   `toolCalling === false` (already ineligible for agentic
//                   routing — no point burning a probe on them).
//   - Cache       — a candidate whose `buildQuality` is already cached FRESH
//                   (keyed by model+version, stable until a new release) is NOT
//                   re-probed.
//   - Cadence     — the probe runs on a cadence (a due-check on a last-probe
//                   timestamp + interval), gated by an opt-in `enabled` flag.
//                   The cadence check lives here; the scheduler consults it.
//
// Everything in this file is PURE + deterministic + never-throwing: no I/O, no
// clock of its own (callers pass `now`), no disk (the cache STORE is an injected
// interface — see `HarnessFitCacheStore` — so nothing here hardcodes an fs path).
// The actual probe dispatch is the injected `HarnessFitRunner` (D3), driven by
// the scheduler; this module only tells it what to run.
//
// @see docs/changes/harness-fit-probe/proposal.md (D5, D6, SC4)

import type { RankedModel } from '../ranker/types.js';

/** A benchmark-ranked candidate the policy reasons about (structural subset of `RankedModel`). */
export type ProbeCandidate = Pick<
  RankedModel,
  'hfRepoId' | 'ollamaName' | 'quant' | 'fitsHardware'
> & {
  /**
   * Agentic tool-calling capability (#833 probe). `false` ⇒ ineligible for
   * agentic routing, so a probe is wasted — prefiltered out. `true`/`undefined`
   * ⇒ eligible (undefined fails OPEN), so probe-worthy.
   */
  toolCalling?: boolean;
};

/** One cached `buildQuality`, keyed by model+version (see {@link probeCacheKey}). */
export interface HarnessFitCacheEntry {
  /** The `buildQuality ∈ [0, 1]` a prior probe produced. `undefined` ⇒ probe errored (fail-open). */
  buildQuality: number | undefined;
  /** Epoch-ms the probe that produced this entry completed. Drives freshness. */
  probedAt: number;
}

/**
 * The injected cache STORE (D5). `local-models` depends only on this interface;
 * the composition root supplies a real disk/in-memory impl (mirroring how the
 * pool state persists). Kept synchronous + tiny so the pure policy can consult it
 * inline; a real store may snapshot itself into a plain map before the tick.
 */
export interface HarnessFitCacheStore {
  /** Look up a cached `buildQuality` for `key`, or `undefined` if never probed. */
  get(key: string): HarnessFitCacheEntry | undefined;
  /** Record `entry` for `key` (called by the scheduler after a probe). */
  set(key: string, entry: HarnessFitCacheEntry): void;
}

/**
 * The cache key for a candidate: model IDENTITY + VERSION, stable until a new
 * release. The Ollama tag (`qwen3:32b`) already embeds the release, so it is the
 * natural version anchor; we fall back to the HF repo id, and always fold in the
 * `quant` (a re-quant is a different artifact with different build behaviour).
 * Pure + total.
 */
export function probeCacheKey(
  candidate: Pick<ProbeCandidate, 'hfRepoId' | 'ollamaName' | 'quant'>
): string {
  const identity = candidate.ollamaName ?? candidate.hfRepoId;
  return `${identity}@${candidate.quant}`;
}

/**
 * Is a cached entry still FRESH (within `ttlMs` of now)? A fresh entry means the
 * candidate is NOT re-probed. Pure predicate — `now` and `ttlMs` are supplied so
 * there is no ambient clock. A non-positive `ttlMs` treats every entry as stale
 * (always re-probe); a future `probedAt` (clock skew) is treated as fresh, never
 * negative-age-stale.
 */
export function isCacheFresh(entry: HarnessFitCacheEntry, now: number, ttlMs: number): boolean {
  if (ttlMs <= 0) return false;
  const ageMs = now - entry.probedAt;
  return ageMs < ttlMs && ageMs >= -ttlMs;
}

/** Options for {@link selectProbeTargets}. */
export interface SelectProbeTargetsOptions {
  /** Probe only the benchmark top-N of the ranked shortlist. NEVER the full set. */
  topN: number;
  /** The injected cache store — a FRESH cached entry skips re-probing. */
  cache: HarnessFitCacheStore;
  /** Epoch-ms "now" for freshness checks. Supplied by the caller (no ambient clock). */
  now: number;
  /** Cache freshness window in ms. An entry older than this is re-probed. */
  cacheTtlMs: number;
}

/**
 * Decide which of the benchmark-ranked shortlist get harness-fit-probed (D5).
 *
 * The shortlist MUST already be sorted best-first (the ranker sorts by score).
 * We take only the TOP-N (cost gate — never the full set), then within that
 * window drop:
 *   1. candidates that don't VRAM-fit (`fitsHardware === false`),
 *   2. candidates that can't tool-call (`toolCalling === false`) — already
 *      agentically ineligible, so a probe is wasted,
 *   3. candidates whose `buildQuality` is already cached FRESH.
 *
 * The top-N window is applied to the FULL ranked list FIRST (so the N+1-th row
 * is never a probe target even if some of the top-N are prefiltered away — the
 * cost gate is "the benchmark leaders", not "the first N probe-eligible rows").
 *
 * Pure + deterministic; never throws. Returns the subset to probe, order
 * preserved. An empty return ⇒ nothing to probe this tick.
 */
export function selectProbeTargets<C extends ProbeCandidate>(
  rankedShortlist: readonly C[],
  opts: SelectProbeTargetsOptions
): C[] {
  // Cost gate FIRST: only the benchmark top-N are ever eligible. Clamp N to a
  // non-negative window so a bad config can only under-probe, never over-probe.
  const window = rankedShortlist.slice(0, Math.max(0, opts.topN));

  return window.filter((candidate) => {
    // Prefilter: VRAM-unfit and confirmed-can't-tool-call are already excluded
    // from agentic routing — probing them cannot change any ranking decision.
    if (candidate.fitsHardware === false) return false;
    if (candidate.toolCalling === false) return false;

    // Cache: a FRESH cached buildQuality (from a prior probe of this exact
    // model+version) means we already know its build fitness — skip re-probing.
    const cached = opts.cache.get(probeCacheKey(candidate));
    if (cached !== undefined && isCacheFresh(cached, opts.now, opts.cacheTtlMs)) {
      return false;
    }
    return true;
  });
}

/** State the cadence gate reads: when the harness-fit probe last ran. */
export interface ProbeCadenceState {
  /** Epoch-ms the probe pass last ran, or `undefined` if it never has (⇒ due). */
  lastProbeAt: number | undefined;
}

/** Inputs to {@link isProbeDue}. */
export interface ProbeCadenceOptions {
  /** Opt-in switch (D5). `false` ⇒ never due. Default OFF at the config layer. */
  enabled: boolean;
  /** Minimum ms between probe passes. A pass runs only once per interval. */
  intervalMs: number;
  /** Epoch-ms "now". Supplied by the caller (no ambient clock). */
  now: number;
}

/**
 * Is a harness-fit probe pass DUE this tick (D5 cadence)? The probe runs on a
 * cadence, NOT every discovery refresh: it fires only when enabled AND at least
 * `intervalMs` has elapsed since the last pass (or it has never run). Pure — the
 * scheduler supplies `now` and the persisted `lastProbeAt`.
 */
export function isProbeDue(state: ProbeCadenceState, opts: ProbeCadenceOptions): boolean {
  if (!opts.enabled) return false;
  if (state.lastProbeAt === undefined) return true;
  return opts.now - state.lastProbeAt >= opts.intervalMs;
}
