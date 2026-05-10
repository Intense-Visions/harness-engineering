import { useState, useEffect, useCallback, memo } from 'react';
import type { MaintenanceHistoryEntry } from '@harness-engineering/types';
import { KpiCard } from '../components/KpiCard';
import { useOrchestratorSocket } from '../hooks/useOrchestratorSocket';

/* ------------------------------------------------------------------ */
/*  Inline types for the maintenance API responses                     */
/* ------------------------------------------------------------------ */

interface SchedulerStatus {
  scheduledTasks: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  running: boolean;
}

// HistoryEntry is the shared wire contract from @harness-engineering/types
// (orchestrator's GET /api/maintenance/history serializer is the producer).
type HistoryEntry = MaintenanceHistoryEntry;

interface ScheduleRow {
  taskId: string;
  /**
   * Optional on the wire shape: an older orchestrator may omit this field.
   * Render `row.type ?? '—'` rather than a blank cell.
   */
  type?: string;
  nextRun: string;
  lastRun: { taskId: string; status: string; startedAt: string; durationMs: number } | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function statusAccent(status: HistoryEntry['status']): string {
  if (status === 'success' || status === 'no-issues') return 'text-emerald-400';
  if (status === 'failed') return 'text-red-400';
  return 'text-yellow-400';
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

const HistoryRow = memo(function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const showCandidatesBadge = entry.task === 'compound-candidates' && (entry.findings ?? 0) > 0;
  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/40">
      <td className="py-2 px-3 font-mono text-xs text-gray-200">
        {entry.task}
        {showCandidatesBadge && (
          <span
            className="ml-2 inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300"
            title="Undocumented learnings detected this run"
          >
            {entry.findings} candidates
          </span>
        )}
      </td>
      <td className={`py-2 px-3 text-xs font-semibold uppercase ${statusAccent(entry.status)}`}>
        {entry.status}
      </td>
      <td className="py-2 px-3 text-xs text-gray-400">{formatTime(entry.startedAt)}</td>
      <td className="py-2 px-3 text-right tabular-nums text-gray-400">
        {formatDuration(entry.durationMs)}
      </td>
    </tr>
  );
});

function HistoryTable({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center">
        <p className="text-sm text-gray-500">
          No maintenance history yet. Runs will appear here after the first execution.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/60">
            <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
              Task
            </th>
            <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
              Status
            </th>
            <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
              Started At
            </th>
            <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
              Duration
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <HistoryRow key={`${e.task}-${e.startedAt}-${i}`} entry={e} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScheduleTable({
  rows,
  inFlight,
  onRunNow,
}: {
  rows: ScheduleRow[];
  inFlight: Set<string>;
  onRunNow: (taskId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center">
        <p className="text-sm text-gray-500">No scheduled tasks.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/60">
            <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
              Task ID
            </th>
            <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
              Type
            </th>
            <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
              Next Run
            </th>
            <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
              Last Run
            </th>
            <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const disabled = inFlight.has(row.taskId);
            return (
              <tr key={row.taskId} className="border-b border-gray-800 hover:bg-gray-800/40">
                <td className="py-2 px-3 font-mono text-xs text-gray-200">{row.taskId}</td>
                <td className="py-2 px-3 text-xs text-gray-400">{row.type ?? '—'}</td>
                <td className="py-2 px-3 text-xs text-gray-400">{formatTime(row.nextRun)}</td>
                <td className="py-2 px-3 text-xs text-gray-400">
                  {row.lastRun ? formatTime(row.lastRun.startedAt) : '—'}
                </td>
                <td className="py-2 px-3 text-right">
                  <button
                    data-task-id={row.taskId}
                    onClick={() => onRunNow(row.taskId)}
                    disabled={disabled}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-200 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {disabled ? 'Running...' : 'Run Now'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Data fetchers                                                      */
/* ------------------------------------------------------------------ */

async function fetchStatus(): Promise<SchedulerStatus> {
  const res = await fetch('/api/maintenance/status');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as SchedulerStatus;
}

async function fetchHistory(): Promise<HistoryEntry[]> {
  const res = await fetch('/api/maintenance/history');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as HistoryEntry[];
}

/**
 * Distinguishes between "older orchestrator without the schedule route" (404)
 * and a genuine server fault (5xx / network) so the page can render an inline
 * error in the second case while staying silent in the first.
 */
class ScheduleNotImplementedError extends Error {
  constructor() {
    super('Schedule endpoint not implemented (404)');
    this.name = 'ScheduleNotImplementedError';
  }
}

async function fetchSchedule(): Promise<ScheduleRow[]> {
  const res = await fetch('/api/maintenance/schedule');
  if (!res.ok) {
    if (res.status === 404) throw new ScheduleNotImplementedError();
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as ScheduleRow[];
}

async function triggerRun(taskId: string): Promise<void> {
  const res = await fetch('/api/maintenance/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export function Maintenance() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [schedule, setSchedule] = useState<ScheduleRow[] | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Tracks the (ref, repoRoot) of a baseref_fallback banner the user closed.
  // The banner re-appears automatically when a fallback with a different
  // identity arrives (covers the multi-worktree case).
  const [dismissedFallback, setDismissedFallback] = useState<{
    ref: string;
    repoRoot: string;
  } | null>(null);
  const { maintenanceEvent, connected } = useOrchestratorSocket();

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([fetchStatus(), fetchHistory()]);
      setStatus(s);
      setHistory(h);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      if (msg.includes('404') || msg.includes('502')) {
        setError('Orchestrator not running. Start with: harness orchestrator run');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
    // Schedule is fetched independently so its absence (e.g. older orchestrator)
    // does not block status/history rendering.
    try {
      const sched = await fetchSchedule();
      setSchedule(sched);
      setScheduleError(null);
    } catch (e) {
      if (e instanceof ScheduleNotImplementedError) {
        // Older orchestrator without the schedule route — degrade silently to
        // an empty schedule so the rest of the page still renders.
        setSchedule([]);
        setScheduleError(null);
      } else {
        // Genuine server fault or network error — surface it inline.
        const msg = e instanceof Error ? e.message : 'Network error';
        setScheduleError(`Failed to load schedule: ${msg}`);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Refetch status, history, and schedule when a maintenance event arrives via WebSocket.
  useEffect(() => {
    if (!maintenanceEvent) return;
    void load();
  }, [maintenanceEvent, load]);

  // Track in-flight task IDs from started/completed/error events.
  useEffect(() => {
    if (!maintenanceEvent) return;
    const event = maintenanceEvent;
    if (event.type === 'maintenance:started') {
      setInFlight((prev) => {
        const next = new Set(prev);
        next.add(event.data.taskId);
        return next;
      });
    } else if (event.type === 'maintenance:completed' || event.type === 'maintenance:error') {
      setInFlight((prev) => {
        const next = new Set(prev);
        next.delete(event.data.taskId);
        return next;
      });
    }
    // 'maintenance:baseref_fallback' is informational; do not touch inFlight.
  }, [maintenanceEvent]);

  const handleRunNow = useCallback((taskId: string) => {
    setInFlight((prev) => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });
    triggerRun(taskId).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : `Failed to trigger ${taskId}`);
      // On a network failure, clear in-flight so the user can retry.
      setInFlight((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    });
  }, []);

  const activeTask =
    maintenanceEvent?.type === 'maintenance:started' ? maintenanceEvent.data.taskId : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Maintenance</h1>
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-gray-600'}`}
            title={connected ? 'WebSocket connected' : 'WebSocket disconnected'}
          />
        </div>
      </div>

      {activeTask && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
          <span className="text-sm text-blue-300">
            Running task: <span className="font-mono font-semibold">{activeTask}</span>
          </span>
        </div>
      )}

      {maintenanceEvent?.type === 'maintenance:error' && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2">
          <span className="text-sm text-red-300">
            Task <span className="font-mono font-semibold">{maintenanceEvent.data.taskId}</span>{' '}
            failed{maintenanceEvent.data.error ? `: ${maintenanceEvent.data.error}` : ''}
          </span>
        </div>
      )}

      {maintenanceEvent?.type === 'maintenance:baseref_fallback' &&
        !(
          dismissedFallback?.ref === maintenanceEvent.data.ref &&
          dismissedFallback?.repoRoot === maintenanceEvent.data.repoRoot
        ) && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
            <span className="text-sm text-amber-300">
              Worktree base-ref fell back to local{' '}
              <span className="font-mono font-semibold">{maintenanceEvent.data.ref}</span> (repo:{' '}
              <span className="font-mono">{maintenanceEvent.data.repoRoot}</span>). Origin may be
              misconfigured or unreachable.
            </span>
            <button
              type="button"
              aria-label="Dismiss baseref fallback warning"
              onClick={() => {
                setDismissedFallback({
                  ref: maintenanceEvent.data.ref,
                  repoRoot: maintenanceEvent.data.repoRoot,
                });
              }}
              className="shrink-0 rounded p-0.5 text-amber-300/80 transition-colors hover:bg-amber-500/20 hover:text-amber-200"
            >
              <span aria-hidden="true" className="text-base leading-none">
                ×
              </span>
            </button>
          </div>
        )}

      {loading && !status && <p className="text-sm text-gray-500">Loading maintenance status...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {status && history && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Scheduler Status
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <KpiCard label="Scheduled Tasks" value={status.scheduledTasks} />
              <KpiCard label="Last Run" value={formatTime(status.lastRunAt)} />
              <KpiCard label="Next Run" value={formatTime(status.nextRunAt)} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Schedule
            </h2>
            {scheduleError && (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2">
                <span className="text-sm text-red-300">{scheduleError}</span>
              </div>
            )}
            {schedule ? (
              <ScheduleTable rows={schedule} inFlight={inFlight} onRunNow={handleRunNow} />
            ) : scheduleError ? null : (
              <p className="text-sm text-gray-500">Loading schedule...</p>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Run History
            </h2>
            <HistoryTable entries={history} />
          </section>
        </div>
      )}
    </div>
  );
}
