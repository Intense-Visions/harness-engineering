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
 *   - `skill_invocation` and `dispatch:decision` events look up the most
 *     recent open maintenance entry (or by `correlationId` if present) and
 *     set `parentSpanId` accordingly so the OTel collector can stitch the
 *     trace together.
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
 * Tracks active maintenance runs so child events (skill invocations, dispatch
 * decisions) can inherit the parent's `traceId` and `parentSpanId`.
 *
 * Key strategy: prefer `correlationId` (explicit threading); fall back to
 * `taskId` when no correlation id is set; fall back to "latest active" if
 * neither is present so we still get *some* correlation when call sites are
 * out-of-band.
 */
class ActiveRunRegistry {
  private byKey = new Map<string, { traceId: string; spanId: string }>();
  private latestKey: string | null = null;

  open(key: string, ids: { traceId: string; spanId: string }): void {
    this.byKey.set(key, ids);
    this.latestKey = key;
  }

  /** Look up an active run; tries `correlationId`, then `taskId`, then latest. */
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
    if (this.latestKey !== null) {
      return this.byKey.get(this.latestKey);
    }
    return undefined;
  }

  close(key: string): void {
    this.byKey.delete(key);
    if (this.latestKey === key) {
      // Pick any remaining as the new "latest" (insertion order via Map).
      const remaining = [...this.byKey.keys()];
      this.latestKey = remaining.length > 0 ? remaining[remaining.length - 1]! : null;
    }
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

  const enqueueToMatchingSubs = async (event: GatewayEvent): Promise<void> => {
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
  };

  const makeHandler =
    (topic: keyof typeof SPAN_NAME) =>
    (data: unknown): void => {
      const payload = (data ?? {}) as Record<string, unknown>;
      const correlationId =
        typeof payload['correlationId'] === 'string'
          ? (payload['correlationId'] as string)
          : undefined;
      const taskId =
        typeof payload['taskId'] === 'string' ? (payload['taskId'] as string) : undefined;

      // Span construction depends on whether this opens, closes, or rides
      // an existing maintenance run.
      let traceId: string;
      let spanId: string;
      let parentSpanId: string | undefined;
      let statusCode: 0 | 1 | 2 | undefined;

      if (topic === TOPICS.MAINTENANCE_STARTED) {
        traceId = newTraceId();
        spanId = newSpanId();
        const key = correlationId ?? taskId ?? `run_${spanId}`;
        registry.open(key, { traceId, spanId });
      } else if (topic === TOPICS.MAINTENANCE_COMPLETED || topic === TOPICS.MAINTENANCE_ERROR) {
        // Close-event spans inherit traceId from the parent; spanId is the
        // parent itself (the parent open/close pair forms one span on OTel
        // collectors that key on (traceId, spanId)).
        const existing = registry.resolve({ correlationId, taskId });
        if (existing !== undefined) {
          traceId = existing.traceId;
          spanId = existing.spanId;
        } else {
          // Orphaned close — emit anyway so collectors see the event.
          traceId = newTraceId();
          spanId = newSpanId();
        }
        statusCode = topic === TOPICS.MAINTENANCE_ERROR ? 2 : 1;
        const key = correlationId ?? taskId ?? '';
        if (key) registry.close(key);
      } else {
        // Child span: skill_invocation or dispatch:decision.
        const parent = registry.resolve({ correlationId, taskId });
        traceId = parent?.traceId ?? newTraceId();
        spanId = newSpanId();
        parentSpanId = parent?.spanId;
      }

      const startNs = nowNs();
      const span: TraceSpan = {
        traceId,
        spanId,
        ...(parentSpanId !== undefined ? { parentSpanId } : {}),
        name: SPAN_NAME[topic],
        kind: SpanKind.INTERNAL,
        startTimeNs: startNs,
        endTimeNs: startNs,
        attributes: buildAttributes(payload, { 'harness.topic': topic }),
        ...(statusCode !== undefined ? { statusCode } : {}),
      };
      exporter.push(span);

      const gatewayEvent: GatewayEvent = {
        id: newEventId(),
        type: TELEMETRY_TYPE[topic],
        timestamp: new Date().toISOString(),
        data: payload,
        ...(correlationId !== undefined ? { correlationId } : {}),
      };
      // Fire and forget — slow webhook subs MUST NOT block the producer.
      void enqueueToMatchingSubs(gatewayEvent);
    };

  for (const topic of Object.values(TOPICS) as Array<keyof typeof SPAN_NAME>) {
    const fn = makeHandler(topic);
    bus.on(topic, fn);
    handlers.push({ topic, fn });
  }

  return (): void => {
    for (const { topic, fn } of handlers) bus.removeListener(topic, fn);
  };
}
