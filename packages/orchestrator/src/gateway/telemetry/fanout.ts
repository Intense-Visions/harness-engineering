import { randomBytes } from 'node:crypto';
import type { EventEmitter } from 'node:events';
import type { GatewayEvent } from '@harness-engineering/types';
import { type OTLPExporter, type TraceSpan, SpanKind } from '@harness-engineering/core';
import type { WebhookStore } from '../webhooks/store';
import type { WebhookDelivery } from '../webhooks/delivery';
import { eventMatches } from '../webhooks/signer';

/**
 * Bus → telemetry fanout (Phase 5 Task 10).
 *
 * Subscribes to the orchestrator's internal lifecycle events and produces two
 * outputs from each one:
 *
 *   1. A {@link TraceSpan} pushed onto an {@link OTLPExporter} for OTel export.
 *   2. A {@link GatewayEvent} with a `telemetry.<topic>` type that is fanned out
 *      to any webhook subscription whose `events` pattern matches.
 *
 * Telemetry events are excluded from wildcard `*.*` subscriptions by the
 * {@link eventMatches} guard added in Phase 5 Task 9 — operators must explicitly
 * subscribe to `telemetry.*` or a specific telemetry topic to receive them.
 *
 * Trace correlation model:
 *   - `maintenance:started` opens a parent span and remembers its
 *     `{ traceId, spanId }` keyed by `taskId`.
 *   - `maintenance:completed` / `maintenance:error` close the parent and
 *     forget the entry.
 *   - `skill_invocation` and `dispatch:decision` events look up an open
 *     maintenance entry by `correlationId` (preferred) or `taskId`. If
 *     neither key matches an active run, the child emits as a root span
 *     rather than guessing a parent — guessing mis-correlates orphan events
 *     onto unrelated traces.
 */

export interface MaintenanceStartedPayload {
  taskId: string;
  startedAt: string;
  correlationId?: string;
}

export interface MaintenanceCompletedPayload {
  taskId: string;
  status?: string;
  correlationId?: string;
  [key: string]: unknown;
}

export interface MaintenanceErrorPayload {
  taskId: string;
  error?: unknown;
  correlationId?: string;
}

export interface SkillInvocationPayload {
  skill: string;
  outcome?: string;
  taskId?: string;
  correlationId?: string;
  turns?: number;
  toolCalls?: number;
  tokensInput?: number;
  tokensOutput?: number;
  cacheHit?: boolean;
  cacheMiss?: boolean;
  durationMs?: number;
}

export interface DispatchDecisionPayload {
  decision: string;
  issueId?: string;
  taskId?: string;
  correlationId?: string;
  reason?: string;
  durationMs?: number;
}

interface WireParams {
  bus: EventEmitter;
  exporter: Pick<OTLPExporter, 'push'>;
  webhookDelivery: Pick<WebhookDelivery, 'enqueue'>;
  store: Pick<WebhookStore, 'listForEvent'>;
}

/** Bus topics this fanout listens to. Order matters only for documentation. */
const TOPICS = {
  MAINTENANCE_STARTED: 'maintenance:started',
  MAINTENANCE_COMPLETED: 'maintenance:completed',
  MAINTENANCE_ERROR: 'maintenance:error',
  DISPATCH_DECISION: 'dispatch:decision',
  SKILL_INVOCATION: 'skill_invocation',
} as const;

/** Internal-event-name → telemetry-topic mapping (for GatewayEvent.type). */
const TELEMETRY_TYPE = {
  [TOPICS.MAINTENANCE_STARTED]: 'telemetry.maintenance_run',
  [TOPICS.MAINTENANCE_COMPLETED]: 'telemetry.maintenance_run',
  [TOPICS.MAINTENANCE_ERROR]: 'telemetry.maintenance_run',
  [TOPICS.DISPATCH_DECISION]: 'telemetry.dispatch_decision',
  [TOPICS.SKILL_INVOCATION]: 'telemetry.skill_invocation',
} as const;

/** Internal-event-name → trace span name (for OTel). */
const SPAN_NAME = {
  [TOPICS.MAINTENANCE_STARTED]: 'maintenance_run',
  [TOPICS.MAINTENANCE_COMPLETED]: 'maintenance_run',
  [TOPICS.MAINTENANCE_ERROR]: 'maintenance_run',
  [TOPICS.DISPATCH_DECISION]: 'dispatch_decision',
  [TOPICS.SKILL_INVOCATION]: 'skill_invocation',
} as const;

function newEventId(): string {
  return `evt_${randomBytes(8).toString('hex')}`;
}

function newTraceId(): string {
  return randomBytes(16).toString('hex'); // 32 hex chars / 16 bytes
}

function newSpanId(): string {
  return randomBytes(8).toString('hex'); // 16 hex chars / 8 bytes
}

function nowNs(): bigint {
  // Date.now() is ms precision; multiplying by 1_000_000 gives ns at ms
  // granularity which is sufficient — span correlation only requires
  // monotonic ordering, not sub-ms accuracy.
  return BigInt(Date.now()) * 1_000_000n;
}

/**
 * Soft cap on concurrently tracked maintenance runs. Prevents the registry
 * from growing without bound when `maintenance:started` fires without a
 * matching `maintenance:completed`/`error` (e.g. orchestrator crash, dropped
 * close event). When the cap is hit, the OLDEST entry is evicted — that run's
 * remaining child events become root spans, which the collector handles
 * gracefully. 256 is sized for "more than any realistic concurrent maintenance
 * fan-out, less than a memory pressure concern."
 */
export const MAX_ACTIVE_RUNS = 256;

/**
 * Tracks active maintenance runs so child events (skill invocations, dispatch
 * decisions) can inherit the parent's `traceId` and `parentSpanId`.
 *
 * Key strategy: prefer `correlationId` (explicit threading); fall back to
 * `taskId` when no correlation id is set. If neither matches, the event has
 * no parent and becomes a root span — we DO NOT fall back to "latest active"
 * because that mis-correlates orphan events onto unrelated (possibly dead)
 * traces. A new root is the safer signal.
 *
 * Bounded by {@link MAX_ACTIVE_RUNS}; oldest entries are evicted first
 * (insertion-order Map).
 */
export class ActiveRunRegistry {
  private byKey = new Map<string, { traceId: string; spanId: string }>();

  open(key: string, ids: { traceId: string; spanId: string }): void {
    // If `key` already exists, refresh the value but DO NOT bump insertion
    // order — re-emits of `maintenance:started` for the same key should not
    // promote it past entries opened more recently. To preserve original
    // insertion position we set in place.
    if (this.byKey.has(key)) {
      this.byKey.set(key, ids);
      return;
    }
    // Enforce the cap BEFORE insert so size never exceeds MAX_ACTIVE_RUNS.
    if (this.byKey.size >= MAX_ACTIVE_RUNS) {
      const oldest = this.byKey.keys().next().value;
      if (oldest !== undefined) this.byKey.delete(oldest);
    }
    this.byKey.set(key, ids);
  }

  /**
   * Look up an active run; tries `correlationId`, then `taskId`. Returns
   * `undefined` when neither matches — the caller should treat the event as
   * a root span rather than guessing a parent.
   */
  resolve(args: {
    correlationId?: string;
    taskId?: string;
  }): { traceId: string; spanId: string } | undefined {
    if (args.correlationId && this.byKey.has(args.correlationId)) {
      return this.byKey.get(args.correlationId);
    }
    if (args.taskId && this.byKey.has(args.taskId)) {
      return this.byKey.get(args.taskId);
    }
    return undefined;
  }

  close(key: string): void {
    this.byKey.delete(key);
  }

  /** Number of currently tracked runs. Exposed for tests + diagnostics. */
  get size(): number {
    return this.byKey.size;
  }
}

function buildAttributes(
  payload: Record<string, unknown>,
  extras: Record<string, string | number | boolean> = {}
): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = { ...extras };
  for (const [k, v] of Object.entries(payload)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      attrs[k] = v;
    }
    // Skip nested objects/arrays — OTLP attribute bag is flat scalar only.
  }
  return attrs;
}

/** Resolved span identifiers for one telemetry event. */
interface SpanPlan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  statusCode?: 0 | 1 | 2;
}

/** Pull the optional `correlationId` / `taskId` string keys off a payload. */
function extractIds(payload: Record<string, unknown>): {
  correlationId: string | undefined;
  taskId: string | undefined;
} {
  const correlationId =
    typeof payload['correlationId'] === 'string' ? payload['correlationId'] : undefined;
  const taskId = typeof payload['taskId'] === 'string' ? payload['taskId'] : undefined;
  return { correlationId, taskId };
}

/** Look up an active run by correlationId (preferred) then taskId. */
function resolveActiveRun(
  registry: ActiveRunRegistry,
  correlationId?: string,
  taskId?: string
): { traceId: string; spanId: string } | undefined {
  return registry.resolve({
    ...(correlationId !== undefined ? { correlationId } : {}),
    ...(taskId !== undefined ? { taskId } : {}),
  });
}

/** `maintenance:started` opens a new parent span and registers it. */
function openMaintenanceSpan(
  registry: ActiveRunRegistry,
  correlationId?: string,
  taskId?: string
): SpanPlan {
  const traceId = newTraceId();
  const spanId = newSpanId();
  const key = correlationId ?? taskId ?? `run_${spanId}`;
  registry.open(key, { traceId, spanId });
  return { traceId, spanId };
}

/**
 * `maintenance:completed` / `maintenance:error` close-event spans inherit
 * traceId from the parent; spanId is the parent itself (the parent open/close
 * pair forms one span on OTel collectors that key on (traceId, spanId)). An
 * orphaned close still emits — with a fresh trace — so collectors see it.
 */
function closeMaintenanceSpan(
  registry: ActiveRunRegistry,
  topic: typeof TOPICS.MAINTENANCE_COMPLETED | typeof TOPICS.MAINTENANCE_ERROR,
  correlationId?: string,
  taskId?: string
): SpanPlan {
  const existing = resolveActiveRun(registry, correlationId, taskId);
  const traceId = existing?.traceId ?? newTraceId();
  const spanId = existing?.spanId ?? newSpanId();
  const statusCode: 0 | 1 | 2 = topic === TOPICS.MAINTENANCE_ERROR ? 2 : 1;
  const key = correlationId ?? taskId ?? '';
  if (key) registry.close(key);
  return { traceId, spanId, statusCode };
}

/** Child span (skill_invocation / dispatch:decision) rides an open parent. */
function childSpan(registry: ActiveRunRegistry, correlationId?: string, taskId?: string): SpanPlan {
  const parent = resolveActiveRun(registry, correlationId, taskId);
  const plan: SpanPlan = {
    traceId: parent?.traceId ?? newTraceId(),
    spanId: newSpanId(),
  };
  if (parent?.spanId !== undefined) plan.parentSpanId = parent.spanId;
  return plan;
}

/**
 * Resolve span identifiers depending on whether this event opens, closes, or
 * rides an existing maintenance run.
 */
function planSpan(
  registry: ActiveRunRegistry,
  topic: keyof typeof SPAN_NAME,
  correlationId?: string,
  taskId?: string
): SpanPlan {
  if (topic === TOPICS.MAINTENANCE_STARTED) {
    return openMaintenanceSpan(registry, correlationId, taskId);
  }
  if (topic === TOPICS.MAINTENANCE_COMPLETED || topic === TOPICS.MAINTENANCE_ERROR) {
    return closeMaintenanceSpan(registry, topic, correlationId, taskId);
  }
  return childSpan(registry, correlationId, taskId);
}

/** Build the OTLP {@link TraceSpan} for one event from its resolved plan. */
function buildSpan(
  topic: keyof typeof SPAN_NAME,
  plan: SpanPlan,
  payload: Record<string, unknown>
): TraceSpan {
  const startNs = nowNs();
  return {
    traceId: plan.traceId,
    spanId: plan.spanId,
    ...(plan.parentSpanId !== undefined ? { parentSpanId: plan.parentSpanId } : {}),
    name: SPAN_NAME[topic],
    kind: SpanKind.INTERNAL,
    startTimeNs: startNs,
    endTimeNs: startNs,
    attributes: buildAttributes(payload, { 'harness.topic': topic }),
    ...(plan.statusCode !== undefined ? { statusCode: plan.statusCode } : {}),
  };
}

/** Build the `telemetry.<topic>` {@link GatewayEvent} for webhook fanout. */
function buildGatewayEvent(
  topic: keyof typeof SPAN_NAME,
  payload: Record<string, unknown>,
  correlationId?: string
): GatewayEvent {
  return {
    id: newEventId(),
    type: TELEMETRY_TYPE[topic],
    timestamp: new Date().toISOString(),
    data: payload,
    ...(correlationId !== undefined ? { correlationId } : {}),
  };
}

async function enqueueToMatchingSubs(
  store: Pick<WebhookStore, 'listForEvent'>,
  webhookDelivery: Pick<WebhookDelivery, 'enqueue'>,
  event: GatewayEvent
): Promise<void> {
  // Use the same matcher the rest of the gateway uses — the Task 9 telemetry
  // exclusion rule applies automatically so `*.*` subs do NOT receive this.
  const subs = await store.listForEvent(event.type);
  if (subs.length === 0) return;
  // Belt-and-braces: re-filter with eventMatches in case the store ever
  // changes the filter contract. The Task 9 rule lives in signer.ts; we
  // import it directly so this fanout never drifts from the policy.
  const filtered = subs.filter((sub) => sub.events.some((p) => eventMatches(p, event.type)));
  for (const sub of filtered) {
    webhookDelivery.enqueue(sub, event);
  }
}

interface HandlerContext {
  registry: ActiveRunRegistry;
  exporter: Pick<OTLPExporter, 'push'>;
  webhookDelivery: Pick<WebhookDelivery, 'enqueue'>;
  store: Pick<WebhookStore, 'listForEvent'>;
}

/** Build the bus listener for one topic: push a span + fan the event out. */
function makeTelemetryHandler(
  ctx: HandlerContext,
  topic: keyof typeof SPAN_NAME
): (data: unknown) => void {
  return (data: unknown): void => {
    const payload = (data ?? {}) as Record<string, unknown>;
    const { correlationId, taskId } = extractIds(payload);
    const plan = planSpan(ctx.registry, topic, correlationId, taskId);
    ctx.exporter.push(buildSpan(topic, plan, payload));
    // Fire and forget — slow webhook subs MUST NOT block the producer.
    void enqueueToMatchingSubs(
      ctx.store,
      ctx.webhookDelivery,
      buildGatewayEvent(topic, payload, correlationId)
    );
  };
}

/**
 * Wire bus events into the OTLP exporter and the webhook delivery pipeline.
 *
 * @returns An `unsubscribe` function that removes all bus listeners and
 *          clears the in-memory trace correlation registry.
 */
export function wireTelemetryFanout(params: WireParams): () => void {
  const { bus, exporter, webhookDelivery, store } = params;
  const registry = new ActiveRunRegistry();
  const handlers: Array<{ topic: string; fn: (data: unknown) => void }> = [];
  const ctx: HandlerContext = { registry, exporter, webhookDelivery, store };

  for (const topic of Object.values(TOPICS) as Array<keyof typeof SPAN_NAME>) {
    const fn = makeTelemetryHandler(ctx, topic);
    bus.on(topic, fn);
    handlers.push({ topic, fn });
  }

  return (): void => {
    for (const { topic, fn } of handlers) bus.removeListener(topic, fn);
  };
}
