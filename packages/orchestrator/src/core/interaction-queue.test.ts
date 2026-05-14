import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { InteractionQueue, type PendingInteraction } from './interaction-queue';

const sample: PendingInteraction = {
  id: 'int_test',
  issueId: 'iss_test',
  type: 'needs-human',
  reasons: ['test'],
  context: {
    issueTitle: 'T',
    issueDescription: null,
    specPath: null,
    planPath: null,
    relatedFiles: [],
  },
  createdAt: new Date().toISOString(),
  status: 'pending',
};

describe('InteractionQueue event emission', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'iq-emit-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('emits interaction.created on push', async () => {
    const bus = new EventEmitter();
    const events: unknown[] = [];
    bus.on('interaction.created', (e) => events.push(e));
    const q = new InteractionQueue(dir, bus);
    await q.push(sample);
    expect(events).toHaveLength(1);
    expect((events[0] as PendingInteraction).id).toBe('int_test');
  });

  it('emits interaction.resolved on updateStatus("resolved") only', async () => {
    const bus = new EventEmitter();
    const events: unknown[] = [];
    bus.on('interaction.resolved', (e) => events.push(e));
    const q = new InteractionQueue(dir, bus);
    await q.push(sample);
    await q.updateStatus('int_test', 'claimed');
    expect(events).toHaveLength(0);
    await q.updateStatus('int_test', 'resolved');
    expect(events).toHaveLength(1);
    const evt = events[0] as { id: string; status: string };
    expect(evt.id).toBe('int_test');
    expect(evt.status).toBe('resolved');
  });

  it('is a no-op when no emitter is passed (backwards compat)', async () => {
    const q = new InteractionQueue(dir); // no emitter
    await q.push(sample);
    await q.updateStatus('int_test', 'resolved');
    // No assertions on emission; just verifying no throw.
  });
});
