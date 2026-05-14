import { randomBytes } from 'node:crypto';
import type { WebhookSubscription, GatewayEvent } from '@harness-engineering/types';
import { sign } from './signer.js';
import { type WebhookQueue, type QueueRow, RETRY_DELAYS_MS, MAX_ATTEMPTS } from './queue.js';
import type { WebhookStore } from './store.js';

interface DeliveryWorkerOptions {
  queue: WebhookQueue;
  store: WebhookStore;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  tickIntervalMs?: number;
  maxConcurrentPerSub?: number;
  drainTimeoutMs?: number;
}

export class WebhookDelivery {
  private readonly queue: WebhookQueue;
  private readonly store: WebhookStore;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly tickIntervalMs: number;
  private readonly maxConcurrentPerSub: number;
  private readonly drainTimeoutMs: number;
  private readonly inFlight = new Map<string, number>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private draining = false;

  constructor(opts: DeliveryWorkerOptions) {
    this.queue = opts.queue;
    this.store = opts.store;
    this.timeoutMs = opts.timeoutMs ?? 5_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.tickIntervalMs = opts.tickIntervalMs ?? 500;
    this.maxConcurrentPerSub = opts.maxConcurrentPerSub ?? 4;
    this.drainTimeoutMs = opts.drainTimeoutMs ?? 30_000;
  }

  enqueue(sub: WebhookSubscription, event: GatewayEvent): void {
    const payload = JSON.stringify(event);
    this.queue.insert({
      id: `dlv_${randomBytes(8).toString('hex')}`,
      subscriptionId: sub.id,
      eventType: event.type,
      payload,
    });
  }

  start(): void {
    if (this.tickTimer !== null) return;
    this.tickTimer = setInterval(() => void this.tick(), this.tickIntervalMs);
  }

  async stop(): Promise<void> {
    this.draining = true;
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    const deadline = Date.now() + this.drainTimeoutMs;
    while (Date.now() < deadline) {
      const total = [...this.inFlight.values()].reduce((a, b) => a + b, 0);
      if (total === 0) break;
      await new Promise<void>((r) => setTimeout(r, 100));
    }
  }

  private async tick(): Promise<void> {
    if (this.draining) return;
    const pending = this.queue.fetchPending(Date.now());
    for (const row of pending) {
      const inFlight = this.inFlight.get(row.subscriptionId) ?? 0;
      if (inFlight >= this.maxConcurrentPerSub) continue;
      this.inFlight.set(row.subscriptionId, inFlight + 1);
      void this.executeDelivery(row);
    }
  }

  private async executeDelivery(row: QueueRow): Promise<void> {
    try {
      const subs = await this.store.list();
      const sub = subs.find((s) => s.id === row.subscriptionId);
      if (!sub) {
        this.queue.markFailed(row.id, MAX_ATTEMPTS, Date.now(), 'subscription deleted');
        return;
      }

      const signature = sign(sub.secret, row.payload);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      let ok = false;
      let lastError = '';
      try {
        const res = await this.fetchImpl(sub.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Harness-Delivery-Id': row.id,
            'X-Harness-Event-Type': row.eventType,
            'X-Harness-Signature': signature,
            'X-Harness-Timestamp': String(Date.now()),
          },
          body: row.payload,
          signal: ctrl.signal,
        });
        ok = res.ok;
        if (!ok) lastError = `HTTP ${res.status}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      } finally {
        clearTimeout(timer);
      }

      if (ok) {
        this.queue.markDelivered(row.id, Date.now());
      } else {
        const nextAttempt = row.attempt + 1;
        const delay = RETRY_DELAYS_MS[row.attempt] ?? 256_000;
        this.queue.markFailed(row.id, nextAttempt, Date.now() + delay, lastError);
      }
    } finally {
      const cur = this.inFlight.get(row.subscriptionId) ?? 1;
      this.inFlight.set(row.subscriptionId, Math.max(0, cur - 1));
    }
  }
}
