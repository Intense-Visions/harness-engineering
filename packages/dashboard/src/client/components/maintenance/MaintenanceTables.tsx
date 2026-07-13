import { memo } from 'react';
import type { HistoryEntry, ScheduleRow } from './useMaintenanceData';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function statusAccent(status: HistoryEntry['status']): string {
  if (status === 'success' || status === 'no-issues') return 'text-emerald-400';
  if (status === 'failed') return 'text-red-400';
  return 'text-yellow-400';
}

export function formatTime(iso: string | null): string {
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

export function HistoryTable({ entries }: { entries: HistoryEntry[] }) {
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

export function ScheduleTable({
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
