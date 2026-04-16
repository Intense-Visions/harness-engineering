import { describe, it, expect, vi } from 'vitest';
import { CINotifier } from '../../src/ci/notifier';
import type { CICheckReport } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type { TrackerSyncAdapter } from '../../src/roadmap/tracker-sync';

function makeAdapter(overrides: Partial<TrackerSyncAdapter> = {}): TrackerSyncAdapter {
  return {
    createTicket: vi.fn().mockResolvedValue(Ok({ externalId: 'github:org/repo#99', url: 'https://github.com/org/repo/issues/99' })),
    updateTicket: vi.fn().mockResolvedValue(Ok({ externalId: 'github:org/repo#99', url: '' })),
    fetchTicketState: vi.fn().mockResolvedValue(Ok({ externalId: '', title: '', status: 'open', labels: [], assignee: null })),
    fetchAllTickets: vi.fn().mockResolvedValue(Ok([])),
    assignTicket: vi.fn().mockResolvedValue(Ok(undefined)),
    getAuthenticatedUser: vi.fn().mockResolvedValue(Ok('@bot')),
    addComment: vi.fn().mockResolvedValue(Ok(undefined)),
    fetchComments: vi.fn().mockResolvedValue(Ok([])),
    ...overrides,
  };
}

function makeReport(overrides: Partial<CICheckReport> = {}): CICheckReport {
  return {
    version: 1,
    project: 'test-project',
    timestamp: '2026-04-16T12:00:00.000Z',
    checks: [
      { name: 'validate', status: 'fail', issues: [{ severity: 'error', message: 'fail' }], durationMs: 10 },
    ],
    summary: { total: 1, passed: 0, failed: 1, warnings: 0, skipped: 0 },
    exitCode: 1,
    ...overrides,
  };
}

describe('CINotifier', () => {
  describe('notifyPR', () => {
    it('posts formatted markdown as a comment on the PR', async () => {
      const adapter = makeAdapter();
      const notifier = new CINotifier(adapter, 'org/repo');

      const result = await notifier.notifyPR(makeReport(), 42);

      expect(result.ok).toBe(true);
      expect(adapter.addComment).toHaveBeenCalledWith(
        'github:org/repo#42',
        expect.stringContaining('Harness CI')
      );
    });

    it('propagates adapter errors', async () => {
      const adapter = makeAdapter({
        addComment: vi.fn().mockResolvedValue(Err(new Error('API error 403'))),
      });
      const notifier = new CINotifier(adapter, 'org/repo');

      const result = await notifier.notifyPR(makeReport(), 42);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('403');
    });
  });

  describe('notifyIssue', () => {
    it('creates an issue from a failing report', async () => {
      const adapter = makeAdapter();
      const notifier = new CINotifier(adapter, 'org/repo');

      const result = await notifier.notifyIssue(makeReport());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBe('https://github.com/org/repo/issues/99');
      }
      expect(adapter.createTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringContaining('1 check(s) failed'),
        }),
        'CI Issues'
      );
    });

    it('uses custom issue title when provided', async () => {
      const adapter = makeAdapter();
      const notifier = new CINotifier(adapter, 'org/repo');

      await notifier.notifyIssue(makeReport(), { issueTitle: 'Custom Title' });

      expect(adapter.createTicket).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Custom Title' }),
        'CI Issues'
      );
    });

    it('refuses to create an issue when report passes', async () => {
      const adapter = makeAdapter();
      const notifier = new CINotifier(adapter, 'org/repo');

      const result = await notifier.notifyIssue(makeReport({ exitCode: 0 }));

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('no failures');
      expect(adapter.createTicket).not.toHaveBeenCalled();
    });

    it('propagates adapter errors on issue creation', async () => {
      const adapter = makeAdapter({
        createTicket: vi.fn().mockResolvedValue(Err(new Error('Rate limited'))),
      });
      const notifier = new CINotifier(adapter, 'org/repo');

      const result = await notifier.notifyIssue(makeReport());

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Rate limited');
    });
  });
});
