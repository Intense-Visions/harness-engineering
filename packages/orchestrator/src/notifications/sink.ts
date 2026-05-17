import type {
  GatewayEvent,
  NotificationEnvelope,
  NotificationDeliveryResult,
} from '@harness-engineering/types';

/**
 * Payload passed to `NotificationSink.deliver`. `wrapped` discriminates
 * which member of the union `payload` is. Sinks branch on `wrapped`
 * rather than runtime-detecting the shape.
 */
export interface NotificationSinkDeliverInput {
  payload: GatewayEvent | NotificationEnvelope;
  wrapped: boolean;
}

/**
 * Hermes Phase 3 sink contract.
 *
 * Sinks subscribe to the orchestrator event bus via `wireNotificationSinks`
 * and deliver each filtered event to a destination (chat channel, webhook
 * URL, etc.). Delivery is best-effort: no retry, no persistence.
 *
 * Sinks MUST be idempotent w.r.t. their own delivery semantics — the bus
 * may emit the same logical state transition more than once during testing
 * or recovery. Sinks should not assume one-shot semantics.
 */
export interface NotificationSink {
  /** Stable id used in config + CLI; lowercase, kebab-case. */
  readonly id: string;
  /** Sink kind literal (matches `NotificationSinkKind`). */
  readonly kind: string;
  /** One-shot delivery. Returns Ok on 2xx, Err on any other outcome. */
  deliver(input: NotificationSinkDeliverInput): Promise<NotificationDeliveryResult>;
  /** Optional teardown hook called on orchestrator stop. */
  dispose?(): Promise<void>;
}
