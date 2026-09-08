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

/**
 * A withheld create must say WHY it was withheld.
 *
 * `--apply` is opt-in, so the DEFAULT run is a dry run and withholds every
 * create. The report used to blame all of them on `--no-create`, sending the
 * reader hunting for a flag they never passed — the same "the message lied
 * about why" failure as #1863, one layer up.
 */
describe('logSyncReport() — why a create was withheld', () => {
  const skipped = (feature: string, reason: 'dry-run' | 'create-disabled') => ({
    feature,
    milestone: 'Intake',
    reason,
  });

  it('attributes a dry-run skip to the dry run, not to --no-create', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    logSyncReport(
      buildReport(syncResult({ dryRun: true, skippedCreates: [skipped('Alpha', 'dry-run')] }), {})
    );

    const line = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('create(s)'));
    expect(line).toBeDefined();
    expect(line).not.toContain('--no-create');
    expect(line).toContain('--apply');
    expect(line).toContain('Alpha');
  });

  it('still names --no-create when that is genuinely the reason', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    logSyncReport(
      buildReport(syncResult({ skippedCreates: [skipped('Beta', 'create-disabled')] }), {})
    );

    const line = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('create(s)'));
    expect(line).toContain('--no-create');
    expect(line).toContain('Beta');
  });

  it('reports each reason separately when both occur', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    logSyncReport(
      buildReport(
        syncResult({
          dryRun: true,
          skippedCreates: [skipped('Alpha', 'dry-run'), skipped('Beta', 'create-disabled')],
        }),
        {}
      )
    );

    const lines = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('create(s)'));
    // Two causes must not be merged under one heading, or one of them is a lie.
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.includes('Alpha'))).toContain('--apply');
    expect(lines.find((l) => l.includes('Beta'))).toContain('--no-create');
  });
});
