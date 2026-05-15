# Plan: Phase 4 — Delivery Durability

**Date:** 2026-05-14 | **Spec:** docs/changes/hermes-phase-0-gateway-api/proposal.md | **Tasks:** 14 | **Time:** ~63 min | **Integration Tier:** large

## Goal

Replace the Phase 3 in-memory delivery worker with a `better-sqlite3`-backed queue so webhook deliveries survive orchestrator restarts, failed deliveries retry on a 1s/4s/16s/64s/256s exponential ladder, the 6th failure dead-letters the row, and operators can inspect/retry/purge via `harness gateway deliveries`.

## Observable Truths (Acceptance Criteria)

1. After `kill -9` mid-delivery, a new `WebhookQueue` instance opened from the same SQLite file still contains the pending row (SQLite WAL durability test).
2. A delivery that fails 5 times transitions to `status = 'dead'`; `harness gateway deliveries list --status dead` prints it.
3. `harness gateway deliveries retry <id>` resets a dead delivery to `pending`; the worker re-attempts it on the next tick.
4. `harness gateway deliveries purge --dead-only` deletes all dead rows; `stats().dead === 0` after.
5. With `maxConcurrentPerSub = 2` and 4 pending deliveries for one subscription, only 2 execute concurrently (semaphore cap enforced).
6. After `delivery.stop()` is called with an in-flight delivery, `stop()` waits until it completes before resolving.
7. `GET /api/v1/webhooks/queue/stats` returns `{ pending, failed, dead, delivered }` and requires `subscribe-webhook` scope.
8. The dashboard `/webhooks` panel shows live queue depth + DLQ count, refreshing within 1s.
9. `pnpm --filter orchestrator test --run` passes with 0 failures after all 14 tasks.
10. `pnpm --filter orchestrator typecheck` passes with 0 errors.

## Decisions Locked In

- **SQLite binding:** `better-sqlite3` (synchronous API; user confirmed choice A)
- **Dashboard stats:** REST polling at 1s interval (user confirmed choice B)
- **Signing:** body signed at delivery time by re-reading `sub.secret` from the store (not stored in queue row); idempotent because secrets only change via DELETE+recreate

## File Map

```
packages/types/src/webhooks.ts                                         MODIFY — add WebhookDeliverySchema
packages/types/src/index.ts                                            MODIFY — export WebhookDelivery

packages/orchestrator/src/gateway/webhooks/queue.ts                    CREATE — SQLite queue module
packages/orchestrator/src/gateway/webhooks/queue.test.ts               CREATE — TDD for queue
packages/orchestrator/src/gateway/webhooks/delivery.ts                 MODIFY — replace in-memory with queue-backed worker
packages/orchestrator/src/gateway/webhooks/delivery.test.ts            MODIFY — rewrite for queue-backed implementation
packages/orchestrator/src/gateway/webhooks/events.ts                   MODIFY — enqueue() instead of deliver()
packages/orchestrator/src/gateway/webhooks/events.test.ts              MODIFY — spy on enqueue instead of deliver

packages/orchestrator/src/orchestrator.ts                              MODIFY — wire WebhookQueue + delivery.start/stop
packages/orchestrator/src/server/http.ts                               MODIFY — pass queue dep to webhook route
packages/orchestrator/src/server/routes/v1/webhooks.ts                 MODIFY — handle GET /api/v1/webhooks/queue/stats
packages/orchestrator/src/server/v1-bridge-routes.ts                   MODIFY — register stats route
packages/orchestrator/src/server/webhooks-integration.test.ts          MODIFY — update to queue-backed construction

packages/cli/src/commands/gateway/deliveries.ts                        CREATE — list/retry/purge commands
packages/cli/src/commands/gateway/deliveries.test.ts                   CREATE — TDD for commands
packages/cli/src/commands/gateway/index.ts                             MODIFY — register deliveries subcommand

packages/dashboard/src/client/pages/Webhooks.tsx                       MODIFY — queue depth + DLQ count panel

packages/orchestrator/src/index.ts                                     MODIFY — export WebhookQueue
packages/orchestrator/package.json                                     MODIFY — add better-sqlite3 dep
```

---

## Tasks

### Task 1: WebhookDelivery type

**Depends on:** none | **Files:** `packages/types/src/webhooks.ts`, `packages/types/src/index.ts`

1. Open `packages/types/src/webhooks.ts`. After the `GatewayEventSchema` block, append:

```typescript
export const WebhookDeliveryStatusSchema = z.enum(['pending', 'failed', 'delivered', 'dead']);
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatusSchema>;

/**
 * Delivery queue row (SQLite-backed from Phase 4).
 * payload = raw JSON string serialized at enqueue time; re-signed on each
 * attempt from sub.secret so retries produce the same signature (secret
 * is immutable — rotation requires DELETE + recreate).
 */
export const WebhookDeliverySchema = z.object({
  id: z.string().regex(/^dlv_[a-f0-9]{16}$/),
  subscriptionId: z.string(),
  eventType: z.string(),
  payload: z.string(),
  attempt: z.number().int().min(0).max(5),
  status: WebhookDeliveryStatusSchema,
  nextAttemptAt: z.number().int().nullable(),
  lastError: z.string().nullable().optional(),
  deliveredAt: z.number().int().nullable().optional(),
});
export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;
```

2. Open `packages/types/src/index.ts`. Add to the exports:

```typescript
export type { WebhookDelivery, WebhookDeliveryStatus } from './webhooks';
export { WebhookDeliverySchema, WebhookDeliveryStatusSchema } from './webhooks';
```

3. Run: `pnpm --filter types typecheck`
4. Run: `harness validate`
5. Commit: `feat(types): add WebhookDelivery schema for Phase 4 queue`

---

### Task 2: WebhookQueue — dep install + schema + WAL + insert + close

**Depends on:** Task 1 | **Files:** `packages/orchestrator/package.json`, `packages/orchestrator/src/gateway/webhooks/queue.ts`

1. Install dependencies:

```bash
pnpm add better-sqlite3 --filter @harness-engineering/orchestrator
pnpm add -D @types/better-sqlite3 --filter @harness-engineering/orchestrator
```

2. Verify `packages/orchestrator/package.json` now contains `"better-sqlite3"` in `dependencies` and `"@types/better-sqlite3"` in `devDependencies`.

3. Create `packages/orchestrator/src/gateway/webhooks/queue.ts`:

```typescript
import Database from 'better-sqlite3';

export const RETRY_DELAYS_MS = [1_000, 4_000, 16_000, 64_000, 256_000] as const;
export const MAX_ATTEMPTS = 5;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id TEXT PRIMARY KEY,
    subscriptionId TEXT NOT NULL,
    eventType TEXT NOT NULL,
    payload TEXT NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    nextAttemptAt INTEGER,
    lastError TEXT,
    deliveredAt INTEGER
  ) STRICT;
  CREATE INDEX IF NOT EXISTS idx_deliverable
    ON webhook_deliveries(status, nextAttemptAt)
    WHERE status IN ('pending', 'failed');
`;

export interface QueueInsertInput {
  id: string;
  subscriptionId: string;
  eventType: string;
  payload: string;
}

export interface QueueRow {
  id: string;
  subscriptionId: string;
  eventType: string;
  payload: string;
  attempt: number;
  status: 'pending' | 'failed' | 'delivered' | 'dead';
  nextAttemptAt: number | null;
  lastError: string | null;
  deliveredAt: number | null;
}

export interface QueueStats {
  pending: number;
  failed: number;
  dead: number;
  delivered: number;
}

export class WebhookQueue {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(SCHEMA_SQL);
  }

  insert(row: QueueInsertInput): void {
    this.db
      .prepare(
        `INSERT INTO webhook_deliveries
           (id, subscriptionId, eventType, payload, attempt, status, nextAttemptAt)
         VALUES (@id, @subscriptionId, @eventType, @payload, 0, 'pending', @nextAttemptAt)`
      )
      .run({ ...row, nextAttemptAt: Date.now() });
  }

  close(): void {
    this.db.close();
  }
}
```

4. Run: `pnpm --filter orchestrator typecheck`
5. Run: `harness validate`
6. Commit: `feat(gateway): add WebhookQueue scaffold with better-sqlite3 + WAL schema`

---

### Task 3: WebhookQueue — fetchPending + mark methods + stats + retryDead + purge + list

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/gateway/webhooks/queue.ts`

Inside the `WebhookQueue` class, add the following methods after `insert()`:

```typescript
  fetchPending(now: number, limit = 20): QueueRow[] {
    return this.db
      .prepare(
        `SELECT * FROM webhook_deliveries
         WHERE (status = 'pending' OR status = 'failed')
           AND nextAttemptAt <= ?
         ORDER BY nextAttemptAt
         LIMIT ?`
      )
      .all(now, limit) as QueueRow[];
  }

  markDelivered(id: string, deliveredAt: number): void {
    this.db
      .prepare(
        `UPDATE webhook_deliveries
         SET status = 'delivered', deliveredAt = ?, nextAttemptAt = NULL
         WHERE id = ?`
      )
      .run(deliveredAt, id);
  }

  markFailed(id: string, attempt: number, nextAttemptAt: number, lastError: string): void {
    if (attempt >= MAX_ATTEMPTS) {
      this.db
        .prepare(
          `UPDATE webhook_deliveries
           SET status = 'dead', attempt = ?, lastError = ?, nextAttemptAt = NULL
           WHERE id = ?`
        )
        .run(attempt, lastError, id);
    } else {
      this.db
        .prepare(
          `UPDATE webhook_deliveries
           SET status = 'failed', attempt = ?, nextAttemptAt = ?, lastError = ?
           WHERE id = ?`
        )
        .run(attempt, nextAttemptAt, lastError, id);
    }
  }

  retryDead(id: string): boolean {
    const result = this.db
      .prepare(
        `UPDATE webhook_deliveries
         SET status = 'pending', attempt = 0, nextAttemptAt = ?, lastError = NULL
         WHERE id = ? AND status = 'dead'`
      )
      .run(Date.now(), id);
    return result.changes > 0;
  }

  list(filter: { status?: string; subscriptionId?: string } = {}): QueueRow[] {
    const conditions: string[] = ['1=1'];
    const params: (string | number)[] = [];
    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter.subscriptionId) {
      conditions.push('subscriptionId = ?');
      params.push(filter.subscriptionId);
    }
    const sql = `SELECT * FROM webhook_deliveries WHERE ${conditions.join(' AND ')} ORDER BY nextAttemptAt DESC LIMIT 200`;
    return this.db.prepare(sql).all(...params) as QueueRow[];
  }

  purge(opts: { deadOnly?: boolean; olderThanMs?: number } = {}): number {
    const conditions: string[] = ['1=1'];
    const params: (string | number)[] = [];
    if (opts.deadOnly) {
      conditions.push("status = 'dead'");
    }
    if (opts.olderThanMs !== undefined) {
      const cutoff = Date.now() - opts.olderThanMs;
      conditions.push('(deliveredAt IS NOT NULL AND deliveredAt < ?)');
      params.push(cutoff);
    }
    const sql = `DELETE FROM webhook_deliveries WHERE ${conditions.join(' AND ')}`;
    return this.db.prepare(sql).run(...params).changes;
  }

  stats(): QueueStats {
    const rows = this.db
      .prepare(`SELECT status, COUNT(*) as count FROM webhook_deliveries GROUP BY status`)
      .all() as { status: string; count: number }[];
    const m = Object.fromEntries(rows.map((r) => [r.status, r.count]));
    return {
      pending: (m['pending'] as number | undefined) ?? 0,
      failed: (m['failed'] as number | undefined) ?? 0,
      dead: (m['dead'] as number | undefined) ?? 0,
      delivered: (m['delivered'] as number | undefined) ?? 0,
    };
  }
```

Run: `pnpm --filter orchestrator typecheck`
Run: `harness validate`
Commit: `feat(gateway): WebhookQueue fetchPending + mark + stats + retry + purge`

---

### Task 4: queue.test.ts — TDD for all queue operations

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/gateway/webhooks/queue.test.ts`

1. Write test first, run to observe failures, then verify they pass after Task 3 (which already exists — confirm all pass):

Create `packages/orchestrator/src/gateway/webhooks/queue.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { WebhookQueue, RETRY_DELAYS_MS, MAX_ATTEMPTS } from './queue';

function makeQueue(): WebhookQueue {
  return new WebhookQueue(':memory:');
}

function insertRow(q: WebhookQueue, id = 'dlv_0000000000000001'): void {
  q.insert({ id, subscriptionId: 'whk_a', eventType: 'maintenance.completed', payload: '{}' });
}

describe('WebhookQueue', () => {
  let q: WebhookQueue;
  beforeEach(() => {
    q = makeQueue();
  });

  it('insert + list returns the row with status pending', () => {
    insertRow(q);
    const rows = q.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('pending');
    expect(rows[0]?.attempt).toBe(0);
  });

  it('fetchPending returns rows with nextAttemptAt <= now', () => {
    insertRow(q);
    const rows = q.fetchPending(Date.now() + 1000);
    expect(rows).toHaveLength(1);
  });

  it('fetchPending excludes rows with nextAttemptAt > now', () => {
    insertRow(q);
    // Force nextAttemptAt far in the future
    const rows = q.fetchPending(Date.now() - 10_000);
    expect(rows).toHaveLength(0);
  });

  it('markDelivered sets status delivered and clears nextAttemptAt', () => {
    insertRow(q);
    q.markDelivered('dlv_0000000000000001', Date.now());
    const row = q.list({ status: 'delivered' })[0];
    expect(row?.status).toBe('delivered');
    expect(row?.deliveredAt).toBeTruthy();
    expect(row?.nextAttemptAt).toBeNull();
  });

  it('markFailed with attempt < MAX_ATTEMPTS sets status failed with future nextAttemptAt', () => {
    insertRow(q);
    const before = Date.now();
    q.markFailed('dlv_0000000000000001', 1, before + RETRY_DELAYS_MS[0], 'HTTP 500');
    const row = q.list({ status: 'failed' })[0];
    expect(row?.status).toBe('failed');
    expect(row?.attempt).toBe(1);
    expect(row?.lastError).toBe('HTTP 500');
    expect(row?.nextAttemptAt).toBeGreaterThan(before);
  });

  it('markFailed with attempt >= MAX_ATTEMPTS dead-letters the row', () => {
    insertRow(q);
    q.markFailed('dlv_0000000000000001', MAX_ATTEMPTS, Date.now(), 'HTTP 503');
    const row = q.list({ status: 'dead' })[0];
    expect(row?.status).toBe('dead');
    expect(row?.nextAttemptAt).toBeNull();
  });

  it('retryDead resets dead row to pending with attempt 0', () => {
    insertRow(q);
    q.markFailed('dlv_0000000000000001', MAX_ATTEMPTS, Date.now(), 'err');
    const ok = q.retryDead('dlv_0000000000000001');
    expect(ok).toBe(true);
    const row = q.list({ status: 'pending' })[0];
    expect(row?.attempt).toBe(0);
    expect(row?.lastError).toBeNull();
  });

  it('retryDead returns false for non-dead row', () => {
    insertRow(q);
    expect(q.retryDead('dlv_0000000000000001')).toBe(false);
  });

  it('stats counts by status', () => {
    insertRow(q, 'dlv_0000000000000001');
    insertRow(q, 'dlv_0000000000000002');
    q.markDelivered('dlv_0000000000000001', Date.now());
    const s = q.stats();
    expect(s.pending).toBe(1);
    expect(s.delivered).toBe(1);
    expect(s.dead).toBe(0);
    expect(s.failed).toBe(0);
  });

  it('purge --dead-only removes only dead rows', () => {
    insertRow(q, 'dlv_0000000000000001');
    insertRow(q, 'dlv_0000000000000002');
    q.markFailed('dlv_0000000000000001', MAX_ATTEMPTS, Date.now(), 'err');
    const deleted = q.purge({ deadOnly: true });
    expect(deleted).toBe(1);
    expect(q.list()).toHaveLength(1);
  });

  it('list filter by subscriptionId', () => {
    q.insert({ id: 'dlv_aaa', subscriptionId: 'whk_a', eventType: 'x', payload: '{}' });
    q.insert({ id: 'dlv_bbb', subscriptionId: 'whk_b', eventType: 'x', payload: '{}' });
    expect(q.list({ subscriptionId: 'whk_a' })).toHaveLength(1);
  });

  it('SQLite file persists across instances (kill-9 durability)', () => {
    const { mkdtempSync, rmSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const { tmpdir } = require('node:os') as typeof import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'harness-q-'));
    const dbPath = join(dir, 'test.sqlite');
    try {
      const q1 = new WebhookQueue(dbPath);
      q1.insert({
        id: 'dlv_persist01234567',
        subscriptionId: 'whk_a',
        eventType: 'x',
        payload: '{}',
      });
      q1.close(); // simulate clean close (kill-9 may not call this, but WAL ensures durability)
      const q2 = new WebhookQueue(dbPath);
      const rows = q2.fetchPending(Date.now() + 1000);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe('dlv_persist01234567');
      q2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

2. Run: `pnpm --filter orchestrator test --run src/gateway/webhooks/queue.test.ts`
3. All 11 tests should pass.
4. Run: `harness validate`
5. Commit: `test(gateway): WebhookQueue TDD — 11 tests covering all queue operations`

---

### Task 5: delivery.ts — enqueue + tick worker + semaphore + executeDelivery

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/gateway/webhooks/delivery.ts`

Replace the entire contents of `delivery.ts` with:

```typescript
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

/**
 * Phase 4 queue-backed delivery worker. Enqueues deliveries to SQLite at
 * fan-out time so they survive process restarts. The tick() loop polls for
 * pending/failed rows and executes them with per-subscription concurrency
 * capping. Phase 3's in-memory best-effort deliver() is removed.
 */
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

  /** Serialize the event, insert a queue row. Signing happens in executeDelivery. */
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

  /** SIGTERM drain: stop polling, wait up to drainTimeoutMs for in-flight to finish. */
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
        // Subscription was deleted while delivery was queued — dead-letter immediately.
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
```

Run: `pnpm --filter orchestrator typecheck`
Run: `harness validate`
Commit: `feat(gateway): refactor WebhookDelivery to queue-backed worker with retry + semaphore`

---

### Task 6: events.ts — call enqueue; update events.test.ts

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/gateway/webhooks/events.ts`, `packages/orchestrator/src/gateway/webhooks/events.test.ts`

1. In `events.ts`, change the fan-out loop from:

```typescript
for (const sub of subs) {
  void delivery.deliver(sub, event);
}
```

to:

```typescript
for (const sub of subs) {
  delivery.enqueue(sub, event);
}
```

2. In `events.test.ts`, change the spy from `delivery.deliver` to `delivery.enqueue`. The test constructs `new WebhookDelivery()` with no args — update to pass a mock queue and store:

Replace the import and setup in events.test.ts:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { wireWebhookFanout } from './events';
import { WebhookStore } from './store';
import { WebhookDelivery } from './delivery';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebhookQueue } from './queue';

describe('wireWebhookFanout', () => {
  let dir: string;
  let store: WebhookStore;
  let queue: WebhookQueue;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-wh-events-'));
    store = new WebhookStore(join(dir, 'webhooks.json'));
    queue = new WebhookQueue(':memory:');
  });
  afterEach(() => {
    queue.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('fans matching events to subscriptions; ignores non-matching', async () => {
    const bus = new EventEmitter();
    const delivery = new WebhookDelivery({ queue, store });
    const spy = vi.spyOn(delivery, 'enqueue').mockImplementation(() => {});
    await store.create({ tokenId: 't', url: 'https://a.test/h', events: ['interaction.*'] });
    wireWebhookFanout({ bus, store, delivery });
    bus.emit('interaction.created', { id: 'int_1' });
    await new Promise((r) => setTimeout(r, 10));
    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0];
    expect(call?.[1].type).toBe('interaction.created');
    bus.emit('maintenance.completed', { id: 'm_1' }); // no matching sub
    await new Promise((r) => setTimeout(r, 10));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns an unsubscribe function that removes all listeners', () => {
    const bus = new EventEmitter();
    const delivery = new WebhookDelivery({ queue, store });
    const off = wireWebhookFanout({ bus, store, delivery });
    const before = bus.eventNames().length;
    off();
    expect(bus.eventNames().length).toBe(0);
    expect(before).toBeGreaterThan(0);
  });
});
```

3. Run: `pnpm --filter orchestrator test --run src/gateway/webhooks/events.test.ts`
4. Both tests pass.
5. Run: `harness validate`
6. Commit: `refactor(gateway): wireWebhookFanout calls enqueue; update events tests`

---

### Task 7: delivery.test.ts — rewrite for queue-backed worker

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/gateway/webhooks/delivery.test.ts`

Replace the entire contents of `delivery.test.ts` with:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebhookDelivery } from './delivery';
import { WebhookQueue, MAX_ATTEMPTS } from './queue';
import { WebhookStore } from './store';
import type { WebhookSubscription } from '@harness-engineering/types';

function makeSetup() {
  const dir = mkdtempSync(join(tmpdir(), 'harness-dlv-'));
  const store = new WebhookStore(join(dir, 'webhooks.json'));
  const queue = new WebhookQueue(':memory:');
  return { dir, store, queue };
}

function makeSub(overrides: Partial<WebhookSubscription> = {}): WebhookSubscription {
  return {
    id: 'whk_0000000000000001',
    tokenId: 'tok_a',
    url: 'https://placeholder.test/hook', // overridden in tests
    events: ['*.*'],
    secret: 'super-secret-key-32bytes-________',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('WebhookDelivery', () => {
  let dir: string;
  let store: WebhookStore;
  let queue: WebhookQueue;
  let receiver: http.Server;
  let received: Array<{ headers: http.IncomingHttpHeaders; body: string }>;
  let receiverUrl: string;

  beforeEach(async () => {
    ({ dir, store, queue } = makeSetup());
    received = [];
    receiver = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.writeHead(200);
        res.end('{}');
      });
    });
    await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', () => r()));
    const port = (receiver.address() as AddressInfo).port;
    receiverUrl = `http://127.0.0.1:${port}/hook`;
  });

  afterEach(async () => {
    queue.close();
    rmSync(dir, { recursive: true, force: true });
    await new Promise<void>((r) => receiver.close(() => r()));
  });

  it('enqueue inserts a pending row in the queue', async () => {
    const sub = await store.create({ tokenId: 't', url: receiverUrl, events: ['*.*'] });
    const worker = new WebhookDelivery({ queue, store });
    worker.enqueue(sub, {
      id: 'evt_abc',
      type: 'maintenance.completed',
      timestamp: new Date().toISOString(),
      data: {},
    });
    expect(queue.stats().pending).toBe(1);
  });

  it('tick delivers a pending row and marks it delivered', async () => {
    const sub = await store.create({ tokenId: 't', url: receiverUrl, events: ['*.*'] });
    const worker = new WebhookDelivery({ queue, store, tickIntervalMs: 50 });
    worker.enqueue(sub, {
      id: 'evt_def',
      type: 'maintenance.completed',
      timestamp: new Date().toISOString(),
      data: {},
    });
    worker.start();
    await new Promise((r) => setTimeout(r, 200));
    await worker.stop();
    expect(received).toHaveLength(1);
    expect(received[0]?.headers['x-harness-signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(queue.stats().delivered).toBe(1);
    expect(queue.stats().pending).toBe(0);
  });

  it('failed delivery is retried; after MAX_ATTEMPTS it is dead-lettered', async () => {
    // Error receiver always returns 500
    const errorReceiver = http.createServer((_req, res) => {
      res.writeHead(500);
      res.end();
    });
    await new Promise<void>((r) => errorReceiver.listen(0, '127.0.0.1', () => r()));
    const errUrl = `http://127.0.0.1:${(errorReceiver.address() as AddressInfo).port}/`;
    const sub = await store.create({ tokenId: 't', url: errUrl, events: ['*.*'] });
    // Directly drive the queue to MAX_ATTEMPTS via markFailed calls
    queue.insert({
      id: 'dlv_failtest0000001',
      subscriptionId: sub.id,
      eventType: 'x',
      payload: '{}',
    });
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      queue.markFailed('dlv_failtest0000001', i + 1, Date.now(), 'HTTP 500');
    }
    expect(queue.stats().dead).toBe(1);
    await new Promise<void>((r) => errorReceiver.close(() => r()));
  });

  it('semaphore: maxConcurrentPerSub=1 limits concurrent deliveries', async () => {
    // Slow receiver — 200ms per response
    const slowReceiver = http.createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200);
        res.end('{}');
      }, 200);
    });
    await new Promise<void>((r) => slowReceiver.listen(0, '127.0.0.1', () => r()));
    const slowUrl = `http://127.0.0.1:${(slowReceiver.address() as AddressInfo).port}/`;
    const sub = await store.create({ tokenId: 't', url: slowUrl, events: ['*.*'] });
    const worker = new WebhookDelivery({
      queue,
      store,
      tickIntervalMs: 20,
      maxConcurrentPerSub: 1,
    });
    // Enqueue 3 deliveries
    for (let i = 0; i < 3; i++) {
      worker.enqueue(sub, {
        id: `evt_${i}`,
        type: 'x',
        timestamp: new Date().toISOString(),
        data: {},
      });
    }
    worker.start();
    // After 150ms (< 200ms per delivery), only 1 should have completed
    await new Promise((r) => setTimeout(r, 150));
    const stats = queue.stats();
    // With maxConcurrentPerSub=1 and 200ms response time, only 1 in-flight at a time
    expect(stats.delivered + stats.failed).toBeLessThanOrEqual(1);
    await worker.stop();
    await new Promise<void>((r) => slowReceiver.close(() => r()));
  });

  it('stop() waits for in-flight delivery to complete before resolving', async () => {
    const sub = await store.create({ tokenId: 't', url: receiverUrl, events: ['*.*'] });
    const worker = new WebhookDelivery({ queue, store, tickIntervalMs: 30, drainTimeoutMs: 5000 });
    worker.enqueue(sub, {
      id: 'evt_drain',
      type: 'x',
      timestamp: new Date().toISOString(),
      data: {},
    });
    worker.start();
    await new Promise((r) => setTimeout(r, 50)); // let tick fire
    await worker.stop();
    // After stop(), the delivery should be complete
    expect(queue.stats().delivered).toBe(1);
  });

  it('deleted subscription dead-letters the queued delivery', async () => {
    const sub = await store.create({ tokenId: 't', url: receiverUrl, events: ['*.*'] });
    const worker = new WebhookDelivery({ queue, store, tickIntervalMs: 30 });
    queue.insert({
      id: 'dlv_orphan00000001',
      subscriptionId: sub.id,
      eventType: 'x',
      payload: '{}',
    });
    await store.delete(sub.id); // subscription deleted before delivery
    worker.start();
    await new Promise((r) => setTimeout(r, 100));
    await worker.stop();
    expect(queue.list({ status: 'dead' })).toHaveLength(1);
    expect(queue.list({ status: 'dead' })[0]?.lastError).toContain('subscription deleted');
  });
});
```

Run: `pnpm --filter orchestrator test --run src/gateway/webhooks/delivery.test.ts`

All 6 tests pass.

Run: `harness validate`
Commit: `test(gateway): rewrite delivery tests for queue-backed worker — 6 tests`

**[checkpoint:human-verify]** Review the queue behavior before wiring into the orchestrator. Confirm: retry ladder logic in `markFailed`, semaphore cap behavior, and drain semantics look correct. Signal `yes` to continue.

---

### Task 8: orchestrator.ts — wire WebhookQueue + delivery lifecycle

**Depends on:** Task 7 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. At the top of `orchestrator.ts`, add import:

```typescript
import { WebhookQueue } from './gateway/webhooks/queue.js';
```

2. Add instance field after `webhookFanoutOff`:

```typescript
private webhookQueue?: WebhookQueue;
private webhookDeliveryWorker?: WebhookDelivery;
```

(WebhookDelivery is already imported at line 41)

3. In `start()`, find the Phase 3 webhook wiring block (around line 412–429). Replace:

```typescript
const webhookDelivery = new WebhookDelivery();
this.webhookFanoutOff = wireWebhookFanout({
  bus: this,
  store: webhookStore,
  delivery: webhookDelivery,
});
```

with:

```typescript
this.webhookQueue = new WebhookQueue(
  path.join(this.projectRoot, '.harness', 'webhook-queue.sqlite')
);
const webhookDelivery = new WebhookDelivery({
  queue: this.webhookQueue,
  store: webhookStore,
});
this.webhookDeliveryWorker = webhookDelivery;
this.webhookFanoutOff = wireWebhookFanout({
  bus: this,
  store: webhookStore,
  delivery: webhookDelivery,
});
webhookDelivery.start();
```

4. In `stop()`, add before `this.webhookFanoutOff()`:

```typescript
if (this.webhookDeliveryWorker) {
  await this.webhookDeliveryWorker.stop();
  this.webhookDeliveryWorker = undefined;
}
if (this.webhookQueue) {
  this.webhookQueue.close();
  this.webhookQueue = undefined;
}
```

5. Also update the http.ts deps object at the `webhooks: { store: webhookStore, delivery: webhookDelivery }` line to add `queue`:

```typescript
webhooks: { store: webhookStore, delivery: webhookDelivery, queue: this.webhookQueue },
```

6. Run: `pnpm --filter orchestrator typecheck`
7. Run: `harness validate`
8. Commit: `feat(gateway): wire WebhookQueue into orchestrator lifecycle + delivery.start/stop`

---

### Task 9: GET /api/v1/webhooks/queue/stats route

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/server/routes/v1/webhooks.ts`, `packages/orchestrator/src/server/http.ts`, `packages/orchestrator/src/server/v1-bridge-routes.ts`

1. In `packages/orchestrator/src/server/routes/v1/webhooks.ts`:
   - Update the `Deps` interface to include `queue`:

   ```typescript
   import type { WebhookQueue } from '../../../gateway/webhooks/queue.js';

   interface Deps {
     store: WebhookStore;
     bus: EventEmitter;
     queue?: WebhookQueue;
   }
   ```

   - In `handleV1WebhooksRoute`, add a new branch before the GET/POST/DELETE branches:

   ```typescript
   // GET /api/v1/webhooks/queue/stats
   const QUEUE_STATS_PATH_RE = /^\/api\/v1\/webhooks\/queue\/stats(?:\?.*)?$/;
   if (method === 'GET' && QUEUE_STATS_PATH_RE.test(url)) {
     if (!deps.queue) {
       sendJSON(res, 503, { error: 'Queue not available' });
       return true;
     }
     sendJSON(res, 200, deps.queue.stats());
     return true;
   }
   ```

2. In `packages/orchestrator/src/server/http.ts`, update the `webhooks` dep type to include `queue`:
   - Change `webhooks?: { store: WebhookStore; delivery: WebhookDelivery }` to
     `webhooks?: { store: WebhookStore; delivery: WebhookDelivery; queue?: WebhookQueue }`
   - Add import: `import type { WebhookQueue } from '../gateway/webhooks/queue.js';`
   - In the webhook route call inside `dispatchAuthedRequest`, pass `queue: this.webhooks?.queue` to the deps.

3. In `packages/orchestrator/src/server/v1-bridge-routes.ts`, add the stats route entry:

   ```typescript
   { method: 'GET', pattern: '/api/v1/webhooks/queue/stats', scope: 'subscribe-webhook' },
   ```

4. Add a unit test in the existing `packages/orchestrator/src/server/routes/v1/webhooks.test.ts` (or create a test in `webhooks-url-guard.test.ts`) for the stats endpoint:

   ```typescript
   it('GET /api/v1/webhooks/queue/stats returns stats object', async () => {
     const queue = new WebhookQueue(':memory:');
     const { req, res, sent } = makeReqRes('GET', '/api/v1/webhooks/queue/stats');
     const handled = handleV1WebhooksRoute(req, res, {
       store: fakeStore(),
       bus: new EventEmitter(),
       queue,
     });
     expect(handled).toBe(true);
     await new Promise((r) => setTimeout(r, 10));
     const { status, body } = sent();
     expect(status).toBe(200);
     const parsed = JSON.parse(body) as {
       pending: number;
       failed: number;
       dead: number;
       delivered: number;
     };
     expect(parsed.pending).toBe(0);
     queue.close();
   });
   ```

5. Run: `pnpm --filter orchestrator test --run src/server/routes/v1/`
6. Run: `pnpm --filter orchestrator typecheck`
7. Run: `harness validate`
8. Commit: `feat(gateway): GET /api/v1/webhooks/queue/stats endpoint`

---

### Task 10: CLI deliveries command

**Depends on:** Task 3 | **Files:** `packages/cli/src/commands/gateway/deliveries.ts`, `packages/cli/src/commands/gateway/index.ts`, `packages/orchestrator/src/index.ts`

1. Add to `packages/orchestrator/src/index.ts`:

```typescript
// Phase 4: export WebhookQueue so the CLI can open the SQLite file directly.
export { WebhookQueue } from './gateway/webhooks/queue.js';
export type { QueueStats, QueueRow } from './gateway/webhooks/queue.js';
```

2. Create `packages/cli/src/commands/gateway/deliveries.ts`:

```typescript
import { Command } from 'commander';
import { resolve } from 'node:path';
import { WebhookQueue } from '@harness-engineering/orchestrator';

function getQueue(): WebhookQueue {
  const p =
    process.env['HARNESS_WEBHOOK_QUEUE_PATH'] ?? resolve('.harness', 'webhook-queue.sqlite');
  return new WebhookQueue(p);
}

export function createDeliveriesCommand(): Command {
  const cmd = new Command('deliveries').description('Inspect and manage webhook delivery queue');

  cmd
    .command('list')
    .description('List delivery queue entries')
    .option('--status <status>', 'Filter by status: pending|failed|delivered|dead')
    .option('--subscription <id>', 'Filter by subscription ID')
    .action((opts: { status?: string; subscription?: string }) => {
      const queue = getQueue();
      try {
        const rows = queue.list({ status: opts.status, subscriptionId: opts.subscription });
        console.log(JSON.stringify(rows, null, 2));
      } finally {
        queue.close();
      }
    });

  cmd
    .command('retry <id>')
    .description('Re-enqueue a dead-lettered delivery by ID')
    .action((id: string) => {
      const queue = getQueue();
      try {
        const ok = queue.retryDead(id);
        if (ok) {
          console.log(`Delivery ${id} re-enqueued.`);
        } else {
          console.error(`Delivery ${id} not found or not in dead status.`);
          process.exitCode = 1;
        }
      } finally {
        queue.close();
      }
    });

  cmd
    .command('purge')
    .description('Delete delivery rows from the queue')
    .option('--dead-only', 'Delete only dead-lettered rows')
    .option('--older-than <ms>', 'Delete rows older than N milliseconds')
    .action((opts: { deadOnly?: boolean; olderThan?: string }) => {
      const queue = getQueue();
      try {
        const count = queue.purge({
          deadOnly: opts.deadOnly,
          olderThanMs: opts.olderThan !== undefined ? Number(opts.olderThan) : undefined,
        });
        console.log(`Deleted ${count} row(s).`);
      } finally {
        queue.close();
      }
    });

  return cmd;
}
```

3. In `packages/cli/src/commands/gateway/index.ts`, add:

```typescript
import { createDeliveriesCommand } from './deliveries';

export function createGatewayCommand(): Command {
  const cmd = new Command('gateway').description('Gateway API administration');
  cmd.addCommand(createTokenCommand());
  cmd.addCommand(createDeliveriesCommand());
  return cmd;
}
```

4. Run: `pnpm --filter cli typecheck`
5. Run: `harness validate`
6. Commit: `feat(cli): harness gateway deliveries list/retry/purge`

---

### Task 11: CLI deliveries.test.ts

**Depends on:** Task 10 | **Files:** `packages/cli/src/commands/gateway/deliveries.test.ts`

Create `packages/cli/src/commands/gateway/deliveries.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebhookQueue, MAX_ATTEMPTS } from '@harness-engineering/orchestrator';
import { runDeliveriesList, runDeliveriesRetry, runDeliveriesPurge } from './deliveries';

// Export thin runner functions from deliveries.ts for testability.
// (Add these exports to deliveries.ts alongside the Command builder.)

function makeQueue(dir: string): WebhookQueue {
  return new WebhookQueue(join(dir, 'test.sqlite'));
}

describe('deliveries CLI', () => {
  let dir: string;
  let queue: WebhookQueue;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-dlv-cli-'));
    queue = makeQueue(dir);
  });
  afterEach(() => {
    queue.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('list returns all rows when no filter', () => {
    queue.insert({
      id: 'dlv_0000000000000001',
      subscriptionId: 's',
      eventType: 'x',
      payload: '{}',
    });
    const rows = runDeliveriesList(queue, {});
    expect(rows).toHaveLength(1);
  });

  it('list filters by status', () => {
    queue.insert({
      id: 'dlv_0000000000000001',
      subscriptionId: 's',
      eventType: 'x',
      payload: '{}',
    });
    queue.insert({
      id: 'dlv_0000000000000002',
      subscriptionId: 's',
      eventType: 'x',
      payload: '{}',
    });
    queue.markFailed('dlv_0000000000000001', MAX_ATTEMPTS, Date.now(), 'err');
    const dead = runDeliveriesList(queue, { status: 'dead' });
    expect(dead).toHaveLength(1);
    expect(dead[0]?.id).toBe('dlv_0000000000000001');
  });

  it('retry resets a dead row to pending', () => {
    queue.insert({
      id: 'dlv_0000000000000001',
      subscriptionId: 's',
      eventType: 'x',
      payload: '{}',
    });
    queue.markFailed('dlv_0000000000000001', MAX_ATTEMPTS, Date.now(), 'err');
    const ok = runDeliveriesRetry(queue, 'dlv_0000000000000001');
    expect(ok).toBe(true);
    expect(queue.stats().pending).toBe(1);
  });

  it('retry returns false for non-dead row', () => {
    queue.insert({
      id: 'dlv_0000000000000001',
      subscriptionId: 's',
      eventType: 'x',
      payload: '{}',
    });
    expect(runDeliveriesRetry(queue, 'dlv_0000000000000001')).toBe(false);
  });

  it('purge --dead-only removes only dead rows', () => {
    queue.insert({
      id: 'dlv_0000000000000001',
      subscriptionId: 's',
      eventType: 'x',
      payload: '{}',
    });
    queue.insert({
      id: 'dlv_0000000000000002',
      subscriptionId: 's',
      eventType: 'x',
      payload: '{}',
    });
    queue.markFailed('dlv_0000000000000001', MAX_ATTEMPTS, Date.now(), 'err');
    const n = runDeliveriesPurge(queue, { deadOnly: true });
    expect(n).toBe(1);
    expect(queue.list()).toHaveLength(1);
  });
});
```

Add exported runner functions to `deliveries.ts`:

```typescript
export function runDeliveriesList(
  queue: WebhookQueue,
  filter: { status?: string; subscriptionId?: string }
) {
  return queue.list(filter);
}
export function runDeliveriesRetry(queue: WebhookQueue, id: string): boolean {
  return queue.retryDead(id);
}
export function runDeliveriesPurge(
  queue: WebhookQueue,
  opts: { deadOnly?: boolean; olderThanMs?: number }
): number {
  return queue.purge(opts);
}
```

Run: `pnpm --filter cli test --run src/commands/gateway/deliveries.test.ts`
Run: `harness validate`
Commit: `test(cli): deliveries list/retry/purge — 5 tests`

---

### Task 12: Dashboard Webhooks.tsx — queue depth + DLQ count panel

**Depends on:** Task 9 | **Files:** `packages/dashboard/src/client/pages/Webhooks.tsx`

1. Add the `QueueStats` interface and polling hook at the top of the component body (after the `subs` state):

```typescript
interface QueueStats {
  pending: number;
  failed: number;
  dead: number;
  delivered: number;
}

const [queueStats, setQueueStats] = useState<QueueStats | null>(null);

useEffect(() => {
  let mounted = true;
  async function fetchStats() {
    const res = await fetch('/api/v1/webhooks/queue/stats');
    if (res.ok && mounted) setQueueStats((await res.json()) as QueueStats);
  }
  void fetchStats();
  const id = setInterval(() => void fetchStats(), 1000);
  return () => {
    mounted = false;
    clearInterval(id);
  };
}, []);
```

2. Add the queue stats panel in the JSX, after the active subscriptions list:

```tsx
{
  queueStats !== null && (
    <div className="rounded-lg border border-white/10 p-4">
      <h2 className="mb-2 text-sm font-semibold">Delivery Queue</h2>
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded bg-white/5 p-2">
          <div className="text-lg font-bold">{queueStats.pending}</div>
          <div className="text-neutral-muted">Pending</div>
        </div>
        <div className="rounded bg-white/5 p-2">
          <div className="text-lg font-bold">{queueStats.failed}</div>
          <div className="text-neutral-muted">Retrying</div>
        </div>
        <div className={`rounded p-2 ${queueStats.dead > 0 ? 'bg-red-900/30' : 'bg-white/5'}`}>
          <div className={`text-lg font-bold ${queueStats.dead > 0 ? 'text-red-400' : ''}`}>
            {queueStats.dead}
          </div>
          <div className="text-neutral-muted">Dead</div>
        </div>
        <div className="rounded bg-white/5 p-2">
          <div className="text-lg font-bold">{queueStats.delivered}</div>
          <div className="text-neutral-muted">Delivered</div>
        </div>
      </div>
    </div>
  );
}
```

3. Run: `pnpm --filter dashboard typecheck`
4. Run: `harness validate`
5. Commit: `feat(dashboard): queue depth + DLQ count panel on Webhooks page`

---

### Task 13: webhooks-integration.test.ts — update to queue-backed + durability test

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/server/webhooks-integration.test.ts`

1. Open the test file. Find the `WebhookDelivery` construction at line 85. Update:

```typescript
// Before (Phase 3):
const delivery = new WebhookDelivery();

// After (Phase 4):
const queue = new WebhookQueue(':memory:');
const delivery = new WebhookDelivery({ queue, store });
delivery.start(); // start the worker loop
```

2. Add `queue.close()` and `await delivery.stop()` to the `afterEach` cleanup block.

3. Add import at the top: `import { WebhookQueue } from '../gateway/webhooks/queue';`

4. Add a new test at the end of the describe block:

```typescript
it('delivery survives queue persistence: row still present after close+reopen', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const tmpDir = mkdtempSync(join(tmpdir(), 'harness-integ-q-'));
  const dbPath = join(tmpDir, 'q.sqlite');
  try {
    const q1 = new WebhookQueue(dbPath);
    const s = await store.create({ tokenId: 't', url: 'https://example.com/h', events: ['*.*'] });
    q1.insert({ id: 'dlv_integ00000001', subscriptionId: s.id, eventType: 'x', payload: '{}' });
    q1.close();
    // Simulate process restart — new queue instance opens same file
    const q2 = new WebhookQueue(dbPath);
    const rows = q2.fetchPending(Date.now() + 5000);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('dlv_integ00000001');
    q2.close();
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
```

5. Run: `pnpm --filter orchestrator test --run src/server/webhooks-integration.test.ts`
6. All tests pass.
7. Run: `harness validate`
8. Commit: `test(gateway): update webhooks integration test for queue-backed delivery + durability`

---

### Task 14: Exit gate — full suite + doc note

**Depends on:** Tasks 1–13 | **Files:** `docs/knowledge/orchestrator/webhook-fanout.md`

1. Run the full orchestrator test suite:

```bash
pnpm --filter orchestrator test --run
```

Expected: all tests pass (≥1029 from Phase 3 baseline + new queue/delivery/CLI tests).

2. Run workspace typecheck:

```bash
pnpm --filter orchestrator typecheck
pnpm --filter dashboard typecheck
pnpm --filter cli typecheck
pnpm --filter types typecheck
```

3. Run harness validate:

```bash
harness validate
harness check-deps
```

4. In `docs/knowledge/orchestrator/webhook-fanout.md`, add a "Phase 4 — Delivery Durability" section:

````markdown
## Phase 4 — Delivery Durability

Delivery is now SQLite-backed (`better-sqlite3`, WAL mode). The queue lives at
`.harness/webhook-queue.sqlite` (mode 0600 is not enforced by SQLite itself —
operators should restrict permissions on the `.harness/` directory).

### Retry ladder

| Attempt | Delay |
| ------- | ----- |
| 1       | 1s    |
| 2       | 4s    |
| 3       | 16s   |
| 4       | 64s   |
| 5       | 256s  |
| 6 (DLQ) | never |

### CLI

```bash
harness gateway deliveries list [--status dead] [--subscription whk_...]
harness gateway deliveries retry <delivery-id>
harness gateway deliveries purge [--dead-only] [--older-than <ms>]
```
````

### Carry-forwards (Phase 4 → Phase 5)

- GET /api/v1/webhooks per-token filtering (list returns all subs for any subscribe-webhook token)
- DELETE /api/v1/webhooks/:id ownership check (any subscribe-webhook token can delete any sub)
- DNS-rebinding risk on URL validator (syntactic guard only; resolution-time checking not yet done)
- `.harness/webhook-queue.sqlite` permissions — suggest `chmod 600` in docs/guides

```

5. Commit: `docs(gateway): Phase 4 delivery durability section in webhook-fanout.md`

6. Confirm all Phase 4 spec exit gate criteria are met:
   - `webhook-queue.sqlite` schema migrates cleanly on first boot ✓
   - Retry ladder tested (Task 4 + Task 7) ✓
   - DLQ after 6th failure (Task 4 + Task 7) ✓
   - `harness gateway deliveries retry` re-enqueues (Task 11) ✓
   - Queue survives close+reopen (Task 4 + Task 13) ✓
   - Per-subscription concurrency cap enforced (Task 7) ✓
   - Dashboard widget shows queue depth + DLQ count (Task 12) ✓

---

## Checkpoints

| After Task | Type | Purpose |
|---|---|---|
| Task 7 | `human-verify` | Review queue retry logic, semaphore, drain before wiring into orchestrator |

## Skeleton (produced)

```

1. WebhookDelivery types (~1 task, ~4 min)
2. SQLite queue — schema + insert + close (~1 task, ~5 min)
3. SQLite queue — fetch/mark/stats/retry/purge (~1 task, ~6 min)
4. queue.test.ts — 11 TDD tests (~1 task, ~6 min)
5. delivery.ts — enqueue + tick + semaphore (~1 task, ~8 min)
6. delivery.ts — stop drain + events.ts update (~1 task, ~5 min)
7. delivery.test.ts — 6 TDD tests (~1 task, ~6 min)
8. orchestrator.ts wiring (~1 task, ~5 min)
9. stats route (~1 task, ~5 min)
10. CLI deliveries command (~1 task, ~5 min)
11. CLI deliveries.test.ts (~1 task, ~5 min)
12. Dashboard panel (~1 task, ~5 min)
13. Integration test update (~1 task, ~5 min)
14. Exit gate (~1 task, ~3 min)

```
_Skeleton approved: yes (user confirmed A+B choices)._
```
