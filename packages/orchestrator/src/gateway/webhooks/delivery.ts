import { randomBytes } from 'node:crypto';
import type { WebhookSubscription, GatewayEvent } from '@harness-engineering/types';
import { sign } from './signer';

interface DeliveryOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * In-memory webhook delivery worker (Phase 3 — no SQLite, no retry, no DLQ).
 *
 * Per spec: best-effort, 3s timeout, failures logged + dropped. Phase 4 adds
 * the durable queue, retry ladder, and DLQ; Phase 3's delivery API
 * (`deliver(sub, event)`) is intentionally the same shape Phase 4 will
 * subclass so the swap is purely additive.
 */
export class WebhookDelivery {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  constructor(opts: DeliveryOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 3000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async deliver(sub: WebhookSubscription, event: GatewayEvent): Promise<void> {
    const body = JSON.stringify(event);
    const deliveryId = `dlv_${randomBytes(8).toString('hex')}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Harness-Delivery-Id': deliveryId,
          'X-Harness-Event-Type': event.type,
          'X-Harness-Signature': sign(sub.secret, body),
          'X-Harness-Timestamp': String(Date.now()),
        },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        console.warn(
          `[webhook] drop sub=${sub.id} delivery=${deliveryId} status=${res.status} (Phase 3: no retry)`
        );
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[webhook] drop sub=${sub.id} delivery=${deliveryId} error=${reason} (Phase 3: no retry)`
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
