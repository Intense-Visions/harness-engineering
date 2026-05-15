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

  it('claim returns rows with nextAttemptAt <= now', () => {
    insertRow(q);
    const rows = q.claim(Date.now() + 1000);
    expect(rows).toHaveLength(1);
  });

  it('claim excludes rows with nextAttemptAt > now', () => {
    insertRow(q);
    const rows = q.claim(Date.now() - 10_000);
    expect(rows).toHaveLength(0);
  });

  it('claim transitions row to in_flight and prevents re-claim by next call', () => {
    insertRow(q);
    const first = q.claim(Date.now() + 1000);
    expect(first).toHaveLength(1);
    expect(first[0]?.status).toBe('in_flight');
    // Second call from an overlapping tick must NOT pick the same row up.
    const second = q.claim(Date.now() + 1000);
    expect(second).toHaveLength(0);
  });

  it('claim returns rows in nextAttemptAt order', () => {
    // Insert three rows then nudge their nextAttemptAt so order is deterministic.
    q.insert({
      id: 'dlv_aaa0000000000003',
      subscriptionId: 'whk_a',
      eventType: 'x',
      payload: '{}',
    });
    q.insert({
      id: 'dlv_aaa0000000000001',
      subscriptionId: 'whk_a',
      eventType: 'x',
      payload: '{}',
    });
    q.insert({
      id: 'dlv_aaa0000000000002',
      subscriptionId: 'whk_a',
      eventType: 'x',
      payload: '{}',
    });
    // Set explicit nextAttemptAt via markFailed (attempt < MAX so stays in failed).
    q.markFailed('dlv_aaa0000000000003', 1, 3000, 'err');
    q.markFailed('dlv_aaa0000000000001', 1, 1000, 'err');
    q.markFailed('dlv_aaa0000000000002', 1, 2000, 'err');
    const rows = q.claim(10_000);
    expect(rows.map((r) => r.id)).toEqual([
      'dlv_aaa0000000000001',
      'dlv_aaa0000000000002',
      'dlv_aaa0000000000003',
    ]);
  });

  it('recoverInFlight resets in_flight rows back to failed on restart', () => {
    insertRow(q);
    const claimed = q.claim(Date.now() + 1000);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.status).toBe('in_flight');
    const n = q.recoverInFlight();
    expect(n).toBe(1);
    const failed = q.list({ status: 'failed' });
    expect(failed).toHaveLength(1);
    expect(failed[0]?.id).toBe('dlv_0000000000000001');
    // The recovered row is now re-claimable by the next tick.
    const reclaimed = q.claim(Date.now() + 1000);
    expect(reclaimed).toHaveLength(1);
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

  it('stats counts by status (including in_flight)', () => {
    insertRow(q, 'dlv_0000000000000001');
    insertRow(q, 'dlv_0000000000000002');
    insertRow(q, 'dlv_0000000000000003');
    q.markDelivered('dlv_0000000000000001', Date.now());
    // Claim row 2 to move it to in_flight without settling it.
    const claimed = q.claim(Date.now() + 1000, 1);
    expect(claimed).toHaveLength(1);
    const s = q.stats();
    expect(s.pending).toBe(1);
    expect(s.inFlight).toBe(1);
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
      const rows = q2.claim(Date.now() + 1000);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe('dlv_persist01234567');
      q2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
