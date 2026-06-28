import type { PulseConfig, PulseWindow, SanitizedResult } from '@harness-engineering/types';
import { getPulseAdapter } from '../adapters/registry';
import { assertSanitized } from '../sanitize';

export type PulseSourceKind = 'analytics' | 'tracing' | 'payments' | 'db';

/**
 * Failure-mode discriminator on a SkipRecord. Phase 6 alerting differentiates:
 *   - `no-adapter`     : configured source name has no registered adapter
 *                        (config issue, not security or transport failure)
 *   - `pii-violation`  : adapter.sanitize() output failed assertSanitized().
 *                        Security-critical — should page on dashboard alerts.
 *   - `query-failure`  : adapter.query() or .sanitize() threw for any other
 *                        reason (network 503, parse error, etc.). Operational.
 */
export type SkipKind = 'no-adapter' | 'pii-violation' | 'query-failure';

export interface SourceResult {
  kind: PulseSourceKind;
  name: string;
  result: SanitizedResult;
}

export interface SkipRecord {
  name: string;
  kind: PulseSourceKind;
  skipKind: SkipKind;
  reason: string;
}

/**
 * Quality sampling on a single configured dimension (`pulse.qualityDimension`),
 * produced only when `pulse.qualityScoring` is enabled. The named dimension's
 * per-source distributions are merged into one bucket→count map. This surfaces
 * *what the data says* about the dimension; it deliberately does not impose a
 * good/bad verdict — the consuming skill or human interprets the distribution.
 */
export interface QualitySummary {
  /** The configured `qualityDimension` this summary aggregates. */
  dimension: string;
  /** Merged bucket→count across every source that reported the dimension. */
  distribution: Record<string, number>;
  /** Sum of all bucket counts. */
  total: number;
  /** How many queried sources contributed a distribution for the dimension. */
  sources: number;
}

export interface OrchestratorResult {
  sources: SourceResult[];
  sourcesQueried: string[];
  sourcesSkipped: SkipRecord[];
  durationMs: number;
  /** Present only when `pulse.qualityScoring` is enabled (see {@link QualitySummary}). */
  quality?: QualitySummary;
}

/**
 * Merge the named dimension's distribution across all successfully-queried
 * sources. A source contributes when its sanitized result carries a
 * `distributions[dimension]` map. When no source reports the dimension the
 * summary is empty (`total: 0, sources: 0`) so callers can say "no quality data
 * for <dimension>" rather than crashing.
 */
export function computeQuality(dimension: string, sources: SourceResult[]): QualitySummary {
  const distribution: Record<string, number> = {};
  let contributing = 0;
  for (const s of sources) {
    const dist = s.result.distributions[dimension];
    if (!dist) continue;
    contributing++;
    for (const [bucket, count] of Object.entries(dist)) {
      distribution[bucket] = (distribution[bucket] ?? 0) + count;
    }
  }
  const total = Object.values(distribution).reduce((sum, n) => sum + n, 0);
  return { dimension, distribution, total, sources: contributing };
}

type QueryOutcome =
  | { ok: true; result: SanitizedResult }
  | { ok: false; skipKind: SkipKind; reason: string };

async function querySource(name: string, window: PulseWindow): Promise<QueryOutcome> {
  const adapter = getPulseAdapter(name);
  if (!adapter) {
    return {
      ok: false,
      skipKind: 'no-adapter',
      reason: `no adapter registered for "${name}"`,
    };
  }
  let sanitized: SanitizedResult;
  try {
    const raw = await adapter.query(window);
    sanitized = adapter.sanitize(raw);
  } catch (err) {
    return {
      ok: false,
      skipKind: 'query-failure',
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  // Defense-in-depth: re-validate that the adapter's sanitize() output really
  // is a SanitizedResult, regardless of what the adapter declares. A failure
  // here is a security-critical PII boundary breach, not a transport error.
  try {
    assertSanitized(sanitized);
  } catch (err) {
    return {
      ok: false,
      skipKind: 'pii-violation',
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  return { ok: true, result: sanitized };
}

/**
 * Run the pulse orchestrator over the configured sources.
 *
 * - Analytics, tracing, and payments dispatch in parallel via Promise.all.
 * - DB runs serially after the parallel batch completes (DB queries are
 *   typically heavier and we don't want to pile contention on the same conn).
 * - Every adapter call is wrapped with `assertSanitized(adapter.sanitize(raw))`
 *   so a leaky adapter cannot smuggle PII through; the source is recorded in
 *   `sourcesSkipped` with the validation error and other sources proceed.
 */
export async function runPulse(
  config: PulseConfig,
  window: PulseWindow
): Promise<OrchestratorResult> {
  const startedAt = Date.now();
  const sources: SourceResult[] = [];
  const sourcesQueried: string[] = [];
  const sourcesSkipped: SkipRecord[] = [];

  // Parallel batch: analytics, tracing, payments — kind is known per slot.
  const parallelSlots: Array<[PulseSourceKind, string | null]> = [
    ['analytics', config.sources.analytics],
    ['tracing', config.sources.tracing],
    ['payments', config.sources.payments],
  ];
  const parallelEntries = parallelSlots.filter(
    (slot): slot is [PulseSourceKind, string] => slot[1] != null
  );

  const parallelResults = await Promise.all(
    parallelEntries.map(([kind, n]) => querySource(n, window).then((r) => [kind, n, r] as const))
  );
  for (const [kind, name, r] of parallelResults) {
    if (r.ok) {
      sources.push({ kind, name, result: r.result });
      sourcesQueried.push(name);
    } else {
      sourcesSkipped.push({ name, kind, skipKind: r.skipKind, reason: r.reason });
    }
  }

  // Serial batch: DB (when configured)
  if (config.sources.db.enabled && config.sources.db.source) {
    const name = config.sources.db.source;
    const r = await querySource(name, window);
    if (r.ok) {
      sources.push({ kind: 'db', name, result: r.result });
      sourcesQueried.push(name);
    } else {
      sourcesSkipped.push({ name, kind: 'db', skipKind: r.skipKind, reason: r.reason });
    }
  }

  // Quality sampling: when enabled with a dimension, aggregate that dimension's
  // distribution across the queried sources (see computeQuality).
  const quality =
    config.qualityScoring && config.qualityDimension
      ? computeQuality(config.qualityDimension, sources)
      : undefined;

  return {
    sources,
    sourcesQueried,
    sourcesSkipped,
    durationMs: Date.now() - startedAt,
    ...(quality ? { quality } : {}),
  };
}
