import { describe, it, expect } from 'vitest';
import type { TrackerSyncAdapter, ExternalSyncOptions } from '../../src/roadmap/tracker-sync';
import type {
  ExternalTicket,
  ExternalTicketState,
  TrackerSyncConfig,
  RoadmapFeature,
  Result,
} from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';

/** Minimal mock adapter for contract verification */
function createMockAdapter(overrides?: Partial<TrackerSyncAdapter>): TrackerSyncAdapter {
  return {
    createTicket: async () =>
      Ok({ externalId: 'github:test/repo#1', url: 'https://github.com/test/repo/issues/1' }),
    updateTicket: async () =>
      Ok({ externalId: 'github:test/repo#1', url: 'https://github.com/test/repo/issues/1' }),
    fetchTicketState: async () =>
      Ok({
        externalId: 'github:test/repo#1',
        title: 'Test',
        status: 'open',
        labels: [],
        assignee: null,
      }),
    fetchAllTickets: async () => Ok([]),
    assignTicket: async () => Ok(undefined),
    ...overrides,
  };
}

describe('TrackerSyncAdapter interface contract', () => {
  it('createTicket returns Result<ExternalTicket> with externalId and url', async () => {
    const adapter = createMockAdapter();
    const feature: RoadmapFeature = {
      name: 'Test Feature',
      status: 'planned',
      spec: null,
      plans: [],
      blockedBy: [],
      summary: 'A test feature',
      assignee: null,
      priority: null,
      externalId: null,
      updatedAt: null,
    };
    const result = await adapter.createTicket(feature, 'MVP');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.externalId).toBe('github:test/repo#1');
    expect(result.value.url).toMatch(/^https:\/\//);
  });

  it('updateTicket returns Result<ExternalTicket>', async () => {
    const adapter = createMockAdapter();
    const result = await adapter.updateTicket('github:test/repo#1', { summary: 'Updated' });
    expect(result.ok).toBe(true);
  });

  it('fetchTicketState returns Result<ExternalTicketState>', async () => {
    const adapter = createMockAdapter();
    const result = await adapter.fetchTicketState('github:test/repo#1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveProperty('externalId');
    expect(result.value).toHaveProperty('status');
    expect(result.value).toHaveProperty('labels');
    expect(result.value).toHaveProperty('assignee');
  });

  it('fetchAllTickets returns Result<ExternalTicketState[]>', async () => {
    const adapter = createMockAdapter();
    const result = await adapter.fetchAllTickets();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.value)).toBe(true);
  });

  it('assignTicket returns Result<void>', async () => {
    const adapter = createMockAdapter();
    const result = await adapter.assignTicket('github:test/repo#1', '@cwarner');
    expect(result.ok).toBe(true);
  });

  it('ExternalSyncOptions defaults forceSync to undefined', () => {
    const opts: ExternalSyncOptions = {};
    expect(opts.forceSync).toBeUndefined();
  });

  it('ExternalSyncOptions accepts forceSync: true', () => {
    const opts: ExternalSyncOptions = { forceSync: true };
    expect(opts.forceSync).toBe(true);
  });
});

describe('TrackerSyncConfig shape', () => {
  it('accepts a valid GitHub config', () => {
    const config: TrackerSyncConfig = {
      kind: 'github',
      repo: 'owner/repo',
      labels: ['harness-managed'],
      statusMap: {
        backlog: 'open',
        planned: 'open',
        'in-progress': 'open',
        done: 'closed',
        blocked: 'open',
      },
      reverseStatusMap: {
        closed: 'done',
        'open:in-progress': 'in-progress',
        'open:blocked': 'blocked',
        'open:planned': 'planned',
      },
    };
    expect(config.kind).toBe('github');
    expect(config.statusMap['done']).toBe('closed');
    expect(config.reverseStatusMap['open:in-progress']).toBe('in-progress');
  });
});
