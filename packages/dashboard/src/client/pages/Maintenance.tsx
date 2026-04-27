import { useState, useEffect, useCallback } from 'react';
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

interface HistoryEntry {
  task: string;
  status: 'success' | 'failed' | 'skipped';
  startedAt: string;
  durationMs: number;
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
  if (status === 'success') return 'text-emerald-400';
  if (status === 'failed') return 'text-red-400';
  return 'text-yellow-400';
}

function formatTime(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString();
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/40">
      <td className="py-2 px-3 font-mono text-xs text-gray-200">{entry.task}</td>
      <td className={`py-2 px-3 text-xs font-semibold uppercase ${statusAccent(entry.status)}`}>
        {entry.status}
      </td>
      <td className="py-2 px-3 text-xs text-gray-400">{formatTime(entry.startedAt)}</td>
      <td className="py-2 px-3 text-right tabular-nums text-gray-400">
        {formatDuration(entry.durationMs)}
      </td>
    </tr>
  );
}

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

/* ------------------------------------------------------------------ */
/*  Data fetchers                                                      */
/* ------------------------------------------------------------------ */

async function fetchStatus(): Promise<SchedulerStatus> {
  const res = await fetch('/api/maintenance/status');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data: SchedulerStatus };
  return body.data;
}

async function fetchHistory(): Promise<HistoryEntry[]> {
  const res = await fetch('/api/maintenance/history');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data: HistoryEntry[] };
  return body.data;
}

async function triggerRun(): Promise<void> {
  const res = await fetch('/api/maintenance/trigger', { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export function Maintenance() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
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
        setError('Orchestrator not running. Start with: pnpm orchestrator:dev');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Refetch status and history when a maintenance event arrives via WebSocket
  useEffect(() => {
    if (!maintenanceEvent) return;
    void load();
  }, [maintenanceEvent, load]);

  const handleTrigger = () => {
    setTriggering(true);
    triggerRun()
      .then(() => load())
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to trigger maintenance run');
      })
      .finally(() => setTriggering(false));
  };

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
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-200 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {triggering ? 'Running...' : 'Trigger Run'}
        </button>
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
              Run History
            </h2>
            <HistoryTable entries={history} />
          </section>
        </div>
      )}
    </div>
  );
}
