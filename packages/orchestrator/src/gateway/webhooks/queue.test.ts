import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
    q.insert({
      id: 'dlv_aaa0000000000000',
      subscriptionId: 'whk_a',
      eventType: 'x',
      payload: '{}',
    });
    q.insert({
      id: 'dlv_bbb0000000000000',
      subscriptionId: 'whk_b',
      eventType: 'x',
      payload: '{}',
    });
    expect(q.list({ subscriptionId: 'whk_a' })).toHaveLength(1);
  });

  it('SQLite file persists across instances (kill-9 durability)', () => {
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
      q1.close();
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
