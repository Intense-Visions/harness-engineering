/**
 * Pulse config — read-side observability config block under `pulse:` in `harness.config.json`.
 * Schema lives in @harness-engineering/core (packages/core/src/pulse/schema.ts).
 * This file is the cross-layer contract; runtime validation happens in core.
 */

export interface PulseDbSource {
  enabled: boolean;
  /** Read-only connection string env var name. Pulse refuses read-write credentials. */
  connectionEnv?: string;
}

export interface PulseSources {
  analytics: string | null;
  tracing: string | null;
  payments: string | null;
  db: PulseDbSource;
}

export interface PulseConfig {
  enabled: boolean;
  lookbackDefault: string;
  primaryEvent: string;
  valueEvent: string;
  completionEvents: string[];
  qualityScoring: boolean;
  qualityDimension: string | null;
  sources: PulseSources;
  metricSourceOverrides: Record<string, string>;
  pendingMetrics: string[];
  excludedMetrics: string[];
}

/**
 * Sanitized adapter result — every provider adapter must return this shape.
 * The adapter's sanitize(rawResult) implementation is the only PII boundary.
 */
export interface SanitizedResult {
  /** Allowlisted scalar fields only. */
  readonly fields: Readonly<
    Partial<{
      event_name: string;
      count: number;
      timestamp_bucket: string;
      error_signature: string;
      latency_ms: number;
      category: string;
    }>
  >;
  /** Per-row data must be aggregated to count distributions before this point. */
  readonly distributions: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/** Adapter contract: every provider adapter exports a sanitize() with this signature. */
export type SanitizeFn<TRaw = unknown> = (rawResult: TRaw) => SanitizedResult;
