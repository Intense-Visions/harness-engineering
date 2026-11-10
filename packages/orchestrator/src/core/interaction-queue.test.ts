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

  it('emits one interaction.created per push, in push order', async () => {
    const bus = new EventEmitter();
    const events: unknown[] = [];
    bus.on('interaction.created', (e) => events.push(e));
    const q = new InteractionQueue(dir, bus);
    // Distinct issueIds so the pending-upsert does not collapse the two pushes.
    await q.push(sample);
    await q.push({ ...sample, id: 'int_second', issueId: 'iss_second' });
    expect(
      events,
      'each push must emit exactly one interaction.created, in the order pushed'
    ).toEqual([
      expect.objectContaining({ id: 'int_test', issueId: 'iss_test', status: 'pending' }),
      expect.objectContaining({ id: 'int_second', issueId: 'iss_second', status: 'pending' }),
    ]);
  });

  it('emits interaction.resolved on updateStatus("resolved") only', async () => {
    const bus = new EventEmitter();
    const events: unknown[] = [];
    bus.on('interaction.resolved', (e) => events.push(e));
    const q = new InteractionQueue(dir, bus);
    await q.push(sample);

    await q.updateStatus('int_test', 'claimed');
    expect(events, 'updateStatus("claimed") must not emit interaction.resolved').toEqual([]);

    await q.updateStatus('int_test', 'resolved');
    expect(
      events,
      'updateStatus("resolved") emits exactly one interaction.resolved for that interaction'
    ).toEqual([expect.objectContaining({ id: 'int_test', status: 'resolved' })]);
  });

  it('persists the interaction and applies status transitions when constructed without an emitter', async () => {
    // Arrange: the pre-Phase-2 construction path (no event bus).
    const q = new InteractionQueue(dir);

    // Act
    await q.push(sample);
    await q.updateStatus('int_test', 'resolved');

    // Assert: the optional emitter must not gate the write path.
    expect(
      await q.list(),
      'emitter-less queue must still persist the interaction and apply the status transition'
    ).toEqual([expect.objectContaining({ id: 'int_test', status: 'resolved' })]);
  });

  // Phase 2 review-fix cycle 1 (IMP-1): interaction.created must emit
  // only allow-listed metadata fields. Read-telemetry scope (required for
  // SSE subscribers) historically means "observability metadata", not
  // "issue corpus" — leaking issueDescription/enrichedSpec/relatedFiles
  // would silently broaden read-telemetry's semantics.
  it('emits allow-listed metadata only on interaction.created (no issue corpus)', async () => {
    const bus = new EventEmitter();
    const events: Record<string, unknown>[] = [];
    bus.on('interaction.created', (e) => events.push(e as Record<string, unknown>));
    const q = new InteractionQueue(dir, bus);
    const rich: PendingInteraction = {
      ...sample,
      id: 'int_rich',
      issueId: 'iss_rich',
      context: {
        issueTitle: 'Sensitive Title',
        issueDescription: 'SECRET: customer PII in description',
        specPath: '/some/spec.md',
        planPath: '/some/plan.md',
        relatedFiles: ['secret1.ts', 'secret2.ts'],
        enrichedSpec: {
          intent: 'do thing',
          summary: 'SECRET summary',
          affectedSystems: ['s1'],
          unknowns: ['u1'],
          ambiguities: ['a1'],
          riskSignals: ['r1'],
        },
        complexityScore: {
          overall: 0.9,
          confidence: 0.8,
          riskLevel: 'high',
          blastRadius: { services: 1, modules: 2, filesEstimated: 5, testFilesAffected: 3 },
          dimensions: { structural: 0.5, semantic: 0.6, historical: 0.7 },
          reasoning: ['why'],
          recommendedRoute: 'manual',
        },
      },
    };
    await q.push(rich);
    expect(events).toHaveLength(1);
    const evt = events[0]!;
    // Positive: bridges depend on these identity fields.
    expect(evt['id']).toBe('int_rich');
    expect(evt['issueId']).toBe('iss_rich');
    expect(evt['type']).toBe('needs-human');
    expect(evt['status']).toBe('pending');
    expect(typeof evt['createdAt']).toBe('string');
    // Negative (block-list defense-in-depth): issue corpus MUST NOT leak.
    expect(evt['context']).toBeUndefined();
    expect(evt['reasons']).toBeUndefined();
    // Recursively flatten the emitted payload and assert none of the
    // sensitive strings/keys appear anywhere.
    const flat = JSON.stringify(evt);
    expect(flat).not.toContain('SECRET');
    expect(flat).not.toContain('issueDescription');
    expect(flat).not.toContain('enrichedSpec');
    expect(flat).not.toContain('relatedFiles');
    expect(flat).not.toContain('complexityScore');
  });
});
