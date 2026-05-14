import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebhookQueue, MAX_ATTEMPTS } from '@harness-engineering/orchestrator';
import { runDeliveriesList, runDeliveriesRetry, runDeliveriesPurge } from './deliveries';

/**
 * Phase 4 Task 11: exercise the CLI runner functions against a real on-disk
 * SQLite file. The runners are thin wrappers over WebhookQueue.list/retryDead/
 * purge — the test goal here is to lock the runner shapes (so refactors of
 * the commander wiring don't silently drift from the underlying queue API)
 * AND prove the CLI works against a real .sqlite file (not just :memory:),
 * which is the actual deployment shape.
 */
describe('deliveries CLI', () => {
  let dir: string;
  let queue: WebhookQueue;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-dlv-cli-'));
    queue = new WebhookQueue(join(dir, 'test.sqlite'));
  });
  afterEach(() => {
    queue.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('list returns all rows when no filter', () => {
    queue.insert({
      id: 'dlv_0000000000000001',
      subscriptionId: 'whk_a',
      eventType: 'x',
      payload: '{}',
    });
    const rows = runDeliveriesList(queue, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('dlv_0000000000000001');
  });

  it('list filters by status (dead-only)', () => {
    queue.insert({
      id: 'dlv_0000000000000001',
      subscriptionId: 'whk_a',
      eventType: 'x',
      payload: '{}',
    });
    queue.insert({
      id: 'dlv_0000000000000002',
      subscriptionId: 'whk_a',
      eventType: 'x',
      payload: '{}',
    });
    queue.markFailed('dlv_0000000000000001', MAX_ATTEMPTS, Date.now(), 'err');
    const dead = runDeliveriesList(queue, { status: 'dead' });
    expect(dead).toHaveLength(1);
    expect(dead[0]?.id).toBe('dlv_0000000000000001');
    expect(dead[0]?.status).toBe('dead');
  });

  it('retry resets a dead row to pending', () => {
    queue.insert({
      id: 'dlv_0000000000000001',
      subscriptionId: 'whk_a',
      eventType: 'x',
      payload: '{}',
    });
    queue.markFailed('dlv_0000000000000001', MAX_ATTEMPTS, Date.now(), 'err');
    expect(queue.stats().dead).toBe(1);
    const ok = runDeliveriesRetry(queue, 'dlv_0000000000000001');
    expect(ok).toBe(true);
    expect(queue.stats().pending).toBe(1);
    expect(queue.stats().dead).toBe(0);
  });

  it('retry returns false for non-dead row', () => {
    queue.insert({
      id: 'dlv_0000000000000001',
      subscriptionId: 'whk_a',
      eventType: 'x',
      payload: '{}',
    });
    expect(runDeliveriesRetry(queue, 'dlv_0000000000000001')).toBe(false);
  });

  it('purge --dead-only removes only dead rows', () => {
    queue.insert({
      id: 'dlv_0000000000000001',
      subscriptionId: 'whk_a',
      eventType: 'x',
      payload: '{}',
    });
    queue.insert({
      id: 'dlv_0000000000000002',
      subscriptionId: 'whk_a',
      eventType: 'x',
      payload: '{}',
    });
    queue.markFailed('dlv_0000000000000001', MAX_ATTEMPTS, Date.now(), 'err');
    const n = runDeliveriesPurge(queue, { deadOnly: true });
    expect(n).toBe(1);
    expect(queue.list()).toHaveLength(1);
    expect(queue.list()[0]?.id).toBe('dlv_0000000000000002');
  });
});
