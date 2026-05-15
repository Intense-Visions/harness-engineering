import { z } from 'zod';

/**
 * Project-level telemetry configuration stored in harness.config.json.
 * Only the on/off toggle lives here -- identity is in .harness/telemetry.json.
 */
export interface TelemetryConfig {
  /** Whether telemetry collection is enabled. Default: true. */
  enabled: boolean;
}

/**
 * Optional identity fields stored in .harness/telemetry.json (gitignored).
 * Each field is independently opt-in.
 */
export interface TelemetryIdentity {
  project?: string;
  team?: string;
  alias?: string;
}

/**
 * Resolved consent state after merging env vars, config, and identity file.
 * Discriminated union: when allowed is false, no identity or installId fields exist.
 */
export type ConsentState =
  | { allowed: true; identity: TelemetryIdentity; installId: string }
  | { allowed: false };

/**
 * A single telemetry event payload for PostHog HTTP batch API.
 */
export interface TelemetryEvent {
  /** Event name, e.g. "skill_invocation", "session_end" */
  event: string;
  /** installId (anonymous) or alias (identified) — snake_case required by PostHog batch API */
  distinct_id: string;
  properties: {
    installId: string;
    os: string;
    nodeVersion: string;
    harnessVersion: string;
    skillName?: string;
    duration?: number;
    outcome?: 'success' | 'failure';
    phasesReached?: string[];
    project?: string;
    team?: string;
  };
  /** ISO 8601 timestamp */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Phase 5 — Telemetry Export (OTLP) shapes
// ---------------------------------------------------------------------------

/**
 * Per-session trajectory metadata produced by the TrajectoryBuilder by
 * joining adoption.jsonl records with the AgentEvent stream snapshot.
 * Surfaced as a span attribute set on `maintenance_run` parent spans and
 * exposed to operators via `/api/v1/telemetry/...` insight endpoints.
 */
export const TrajectoryMetadataSchema = z.object({
  turnsCount: z.number().int().nonnegative(),
  toolCallCount: z.number().int().nonnegative(),
  modelTokenSpend: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    cacheRead: z.number().int().nonnegative(),
    cacheCreation: z.number().int().nonnegative(),
  }),
  promptCacheHit: z.number().int().nonnegative(),
  promptCacheMiss: z.number().int().nonnegative(),
  totalDurationMs: z.number().int().nonnegative(),
  phasesReached: z.array(z.string()),
});
export type TrajectoryMetadata = z.infer<typeof TrajectoryMetadataSchema>;

/**
 * Aggregated prompt-cache statistics returned by
 * `GET /api/v1/telemetry/cache/stats`. Backed by an in-memory ring buffer
 * (capacity 1000) in `CacheMetricsRecorder`; restarts reset the stats.
 */
export const PromptCacheStatsSchema = z.object({
  totalRequests: z.number().int().nonnegative(),
  hits: z.number().int().nonnegative(),
  misses: z.number().int().nonnegative(),
  hitRate: z.number().min(0).max(1),
  byBackend: z.record(
    z.string(),
    z.object({
      hits: z.number().int().nonnegative(),
      misses: z.number().int().nonnegative(),
    })
  ),
  windowStartedAt: z.number().int(),
});
export type PromptCacheStats = z.infer<typeof PromptCacheStatsSchema>;

/**
 * OTLP/HTTP JSON wire types — subset used by the in-tree exporter.
 *
 * Per OTLP/HTTP v1.0.0 spec, numeric attribute values that may exceed
 * 2^53 (e.g. `intValue` for nanosecond timestamps) are serialized as
 * strings. `traceId` and `spanId` are lowercase hex strings (16-byte /
 * 8-byte respectively).
 */
export const OTLPKeyValueSchema = z.object({
  key: z.string(),
  value: z.object({
    stringValue: z.string().optional(),
    intValue: z.string().optional(),
    doubleValue: z.number().optional(),
    boolValue: z.boolean().optional(),
  }),
});
export type OTLPKeyValue = z.infer<typeof OTLPKeyValueSchema>;

export const OTLPSpanSchema = z.object({
  traceId: z.string().length(32), // 16-byte hex
  spanId: z.string().length(16), // 8-byte hex
  parentSpanId: z.string().length(16).optional(),
  name: z.string(),
  kind: z.number().int(), // SpanKind enum (1=INTERNAL, 2=SERVER, 3=CLIENT, 4=PRODUCER, 5=CONSUMER)
  startTimeUnixNano: z.string(), // decimal nanoseconds as string (int64 unsafe in JSON)
  endTimeUnixNano: z.string(),
  attributes: z.array(OTLPKeyValueSchema),
  status: z.object({ code: z.number().int() }).optional(),
});
export type OTLPSpan = z.infer<typeof OTLPSpanSchema>;
