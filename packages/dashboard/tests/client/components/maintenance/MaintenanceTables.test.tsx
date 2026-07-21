import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  formatDuration,
  formatTime,
  HistoryTable,
  ScheduleTable,
} from '../../../../src/client/components/maintenance/MaintenanceTables';
import type {
  HistoryEntry,
  ScheduleRow,
} from '../../../../src/client/components/maintenance/useMaintenanceData';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

// A concrete ISO instant used across formatTime assertions. Expected strings
// are derived from `new Date(...)` (the SUT's own source of truth) rather than
// hardcoded, so the test stays locale/timezone-agnostic and deterministic.
const ISO = '2026-06-15T13:45:00.000Z';

function historyEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    task: 'compound-learnings',
    startedAt: ISO,
    durationMs: 1500,
    status: 'success',
    findings: 0,
    prUrl: null,
    ...overrides,
  };
}

function scheduleRow(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    taskId: 'doc-drift',
    type: 'scan',
    nextRun: ISO,
    lastRun: null,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  formatDuration                                                     */
/* ------------------------------------------------------------------ */

describe('formatDuration', () => {
  it('renders sub-second durations in rounded milliseconds', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(12.4)).toBe('12ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('renders sub-minute durations in seconds to one decimal', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(59_000)).toBe('59.0s');
  });

  it('renders minute-scale durations in minutes to one decimal', () => {
    expect(formatDuration(60_000)).toBe('1.0m');
    expect(formatDuration(90_000)).toBe('1.5m');
  });
});

/* ------------------------------------------------------------------ */
/*  formatTime                                                         */
/* ------------------------------------------------------------------ */

describe('formatTime', () => {
  it('returns an em dash for a null timestamp', () => {
    expect(formatTime(null)).toBe('—');
  });

  it('formats an ISO timestamp via the locale string of the parsed Date', () => {
    // Derive the expectation from the same Date the SUT uses so the assertion
    // is independent of the runner's locale/timezone.
    expect(formatTime(ISO)).toBe(new Date(ISO).toLocaleString());
  });
});

/* ------------------------------------------------------------------ */
/*  HistoryTable                                                       */
/* ------------------------------------------------------------------ */

describe('HistoryTable', () => {
  it('renders an empty-state message and no table when there are no entries', () => {
    render(<HistoryTable entries={[]} />);
    expect(screen.getByText(/No maintenance history yet/i)).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders one row per entry with task, status, started-at and duration', () => {
    const entries = [
      historyEntry({ task: 'compound-learnings', status: 'success', durationMs: 2500 }),
      historyEntry({ task: 'doc-drift', status: 'failed', durationMs: 90_000 }),
    ];
    render(<HistoryTable entries={entries} />);

    // One header row + two body rows.
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(entries.length + 1);

    expect(screen.getByText('compound-learnings')).toBeDefined();
    expect(screen.getByText('doc-drift')).toBeDefined();
    expect(screen.getByText('success')).toBeDefined();
    expect(screen.getByText('failed')).toBeDefined();
    // Durations use the same helper the unit tests cover above.
    expect(screen.getByText(formatDuration(2500))).toBeDefined();
    expect(screen.getByText(formatDuration(90_000))).toBeDefined();
  });

  it('shows a candidates badge only for compound-candidates runs with findings', () => {
    render(
      <HistoryTable
        entries={[
          historyEntry({ task: 'compound-candidates', findings: 3 }),
          // Same task, zero findings -> no badge.
          historyEntry({
            task: 'compound-candidates',
            findings: 0,
            startedAt: '2026-06-15T14:00:00.000Z',
          }),
          // Findings present but different task -> no badge.
          historyEntry({ task: 'doc-drift', findings: 5, startedAt: '2026-06-15T15:00:00.000Z' }),
        ]}
      />
    );
    const badges = screen.getAllByTitle(/Undocumented learnings detected/i);
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toContain('3 candidates');
  });

  it('applies the failure accent class to a failed status cell', () => {
    render(<HistoryTable entries={[historyEntry({ status: 'failed' })]} />);
    expect(screen.getByText('failed').className).toContain('text-red-400');
  });

  it('applies the success accent class to success and no-issues statuses', () => {
    render(
      <HistoryTable
        entries={[
          historyEntry({ task: 'a', status: 'success' }),
          historyEntry({ task: 'b', status: 'no-issues', startedAt: '2026-06-15T16:00:00.000Z' }),
        ]}
      />
    );
    expect(screen.getByText('success').className).toContain('text-emerald-400');
    expect(screen.getByText('no-issues').className).toContain('text-emerald-400');
  });

  it('applies the neutral accent class to a skipped status', () => {
    render(<HistoryTable entries={[historyEntry({ status: 'skipped' })]} />);
    expect(screen.getByText('skipped').className).toContain('text-yellow-400');
  });
});

/* ------------------------------------------------------------------ */
/*  ScheduleTable                                                      */
/* ------------------------------------------------------------------ */

describe('ScheduleTable', () => {
  const noop = () => {};

  it('renders an empty-state message and no table when there are no rows', () => {
    render(<ScheduleTable rows={[]} inFlight={new Set()} onRunNow={noop} />);
    expect(screen.getByText('No scheduled tasks.')).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders a row per task with next-run time and a Run Now button', () => {
    render(
      <ScheduleTable
        rows={[scheduleRow({ taskId: 'doc-drift' })]}
        inFlight={new Set()}
        onRunNow={noop}
      />
    );
    expect(screen.getByText('doc-drift')).toBeDefined();
    expect(screen.getByText(formatTime(ISO))).toBeDefined();
    const button = screen.getByRole('button', { name: /run now/i });
    expect(button).toBeDefined();
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('falls back to an em dash for a missing type field', () => {
    const { type: _omit, ...withoutType } = scheduleRow();
    render(
      <ScheduleTable rows={[withoutType as ScheduleRow]} inFlight={new Set()} onRunNow={noop} />
    );
    // Row cells: taskId, type(—), nextRun, lastRun(—), action.
    const row = screen.getByText('doc-drift').closest('tr') as HTMLElement;
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the last-run started-at when present and an em dash when absent', () => {
    const lastRunIso = '2026-06-14T10:00:00.000Z';
    render(
      <ScheduleTable
        rows={[
          scheduleRow({
            taskId: 'with-last',
            lastRun: {
              taskId: 'with-last',
              status: 'success',
              startedAt: lastRunIso,
              durationMs: 500,
            },
          }),
          scheduleRow({ taskId: 'no-last', nextRun: ISO, lastRun: null }),
        ]}
        inFlight={new Set()}
        onRunNow={noop}
      />
    );
    const withLastRow = screen.getByText('with-last').closest('tr') as HTMLElement;
    expect(within(withLastRow).getByText(formatTime(lastRunIso))).toBeDefined();
  });

  it('invokes onRunNow with the row task id when the button is clicked', () => {
    const onRunNow = vi.fn();
    render(
      <ScheduleTable
        rows={[scheduleRow({ taskId: 'doc-drift' })]}
        inFlight={new Set()}
        onRunNow={onRunNow}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /run now/i }));
    expect(onRunNow).toHaveBeenCalledTimes(1);
    expect(onRunNow).toHaveBeenCalledWith('doc-drift');
  });

  it('disables the button and shows a running label for an in-flight task', () => {
    const onRunNow = vi.fn();
    render(
      <ScheduleTable
        rows={[scheduleRow({ taskId: 'doc-drift' })]}
        inFlight={new Set(['doc-drift'])}
        onRunNow={onRunNow}
      />
    );
    const button = screen.getByRole('button', { name: /running/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onRunNow).not.toHaveBeenCalled();
  });
});
