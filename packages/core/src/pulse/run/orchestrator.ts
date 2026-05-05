import type { PulseConfig, PulseWindow, SanitizedResult } from '@harness-engineering/types';
import { getPulseAdapter } from '../adapters/registry';
import { assertSanitized } from '../sanitize';

export interface OrchestratorResult {
  sources: SanitizedResult[];
  sourcesQueried: string[];
  sourcesSkipped: Array<{ name: string; reason: string }>;
  durationMs: number;
}

type QueryOutcome = { ok: true; result: SanitizedResult } | { ok: false; reason: string };

async function querySource(name: string, window: PulseWindow): Promise<QueryOutcome> {
  const adapter = getPulseAdapter(name);
  if (!adapter) return { ok: false, reason: `no adapter registered for "${name}"` };
  try {
    const raw = await adapter.query(window);
    const sanitized = adapter.sanitize(raw);
    // Defense-in-depth: re-validate that the adapter's sanitize() output
    // really is a SanitizedResult, regardless of what the adapter declares.
    assertSanitized(sanitized);
    return { ok: true, result: sanitized };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
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
  const sources: SanitizedResult[] = [];
  const sourcesQueried: string[] = [];
  const sourcesSkipped: Array<{ name: string; reason: string }> = [];

  // Parallel batch: analytics, tracing, payments
  const parallelNames = [
    config.sources.analytics,
    config.sources.tracing,
    config.sources.payments,
  ].filter((n): n is string => n != null);

  const parallelResults = await Promise.all(
    parallelNames.map((n) => querySource(n, window).then((r) => [n, r] as const))
  );
  for (const [name, r] of parallelResults) {
    if (r.ok) {
      sources.push(r.result);
      sourcesQueried.push(name);
    } else {
      sourcesSkipped.push({ name, reason: r.reason });
    }
  }

  // Serial batch: DB (when configured)
  if (config.sources.db.enabled && config.sources.db.source) {
    const name = config.sources.db.source;
    const r = await querySource(name, window);
    if (r.ok) {
      sources.push(r.result);
      sourcesQueried.push(name);
    } else {
      sourcesSkipped.push({ name, reason: r.reason });
    }
  }

  // pulse.qualityScoring runtime path is deferred to a follow-up phase.
  // TODO(phase-4.5): wire qualityScoring + qualityDimension into orchestrator.

  return { sources, sourcesQueried, sourcesSkipped, durationMs: Date.now() - startedAt };
}
