import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SyncResult } from '@harness-engineering/core';
import { buildReport, logSyncReport } from '../../../src/commands/roadmap/sync-report';
import { logger } from '../../../src/output/logger';

/**
 * The suppression channel of `harness roadmap sync`.
 *
 * The sync engine's stated convention is that a withheld action lands
 * somewhere, never nowhere. Collecting `suppressedInbound` in the engine and
 * then dropping it in the report would restore the silence one layer up: an
 * operator asking "why did my GitHub unassign not take effect" would still get
 * no answer, from either `--json` or the prose.
 */

function syncResult(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    created: [],
    updated: [],
    assignmentChanges: [],
    errors: [],
    dryRun: false,
    planned: { creates: [], updates: [], localWrites: [] },
    skippedCreates: [],
    skippedStateChanges: [],
    suppressedInbound: [],
    examined: { roadmapRows: 1, ticketsFetched: 1 },
    ...overrides,
  };
}

const SUPPRESSED = [
  {
    feature: 'Alpha',
    field: 'assignee' as const,
    from: '@alice',
    to: null,
    reason: 'tracker-reports-no-assignee',
  },
  {
    feature: 'Idea Row',
    field: 'status' as const,
    from: 'backlog',
    to: 'planned',
    reason: 'tracker-open-without-status-label',
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildReport() — suppressed inbound writes', () => {
  it('carries them into the --json payload', () => {
    const report = buildReport(syncResult({ suppressedInbound: SUPPRESSED }), {});

    expect(report.skipped.inbound).toEqual(SUPPRESSED);
    expect(() => JSON.stringify(report)).not.toThrow();
  });

  it('is empty, not absent, when nothing was withheld', () => {
    expect(buildReport(syncResult(), {}).skipped.inbound).toEqual([]);
  });
});

describe('logSyncReport() — suppressed inbound writes', () => {
  it('warns per feature, naming the field, the kept value and the reason', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    logSyncReport(buildReport(syncResult({ suppressedInbound: SUPPRESSED }), {}));

    const line = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('inbound'));
    expect(line).toBeDefined();
    expect(line).toContain('Withheld 2 inbound write(s)');
    // The operator's actual question is "which row, which field, and why".
    expect(line).toContain('Alpha assignee @alice→— (tracker-reports-no-assignee)');
    expect(line).toContain('Idea Row status backlog→planned');
  });

  it('stays silent when nothing was withheld', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    logSyncReport(buildReport(syncResult(), {}));

    expect(warn).not.toHaveBeenCalled();
  });
});
