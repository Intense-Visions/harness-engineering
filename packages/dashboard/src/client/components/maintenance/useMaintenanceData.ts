import { useState, useEffect, useCallback } from 'react';
import type { MaintenanceHistoryEntry } from '@harness-engineering/types';
import { useOrchestratorSocket } from '../../hooks/useOrchestratorSocket';

/* ------------------------------------------------------------------ */
/*  Inline types for the maintenance API responses                     */
/* ------------------------------------------------------------------ */

export interface SchedulerStatus {
  scheduledTasks: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  running: boolean;
}

// HistoryEntry is the shared wire contract from @harness-engineering/types
// (orchestrator's GET /api/maintenance/history serializer is the producer).
export type HistoryEntry = MaintenanceHistoryEntry;

export interface ScheduleRow {
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
/*  Set helpers — keep the reducer branches out of the effects         */
/* ------------------------------------------------------------------ */

function withAdded(prev: Set<string>, taskId: string): Set<string> {
  const next = new Set(prev);
  next.add(taskId);
  return next;
}

function withRemoved(prev: Set<string>, taskId: string): Set<string> {
  const next = new Set(prev);
  next.delete(taskId);
  return next;
}

/**
 * Reconcile the client-tracked in-flight set against the server's authoritative
 * `activeRun`, returning a new set (or `prev` unchanged when nothing differs, to
 * avoid a spurious render). Pure — extracted so the polling effect stays flat.
 */
function reconcileInFlight(prev: Set<string>, serverActive: string | null): Set<string> {
  const next = new Set<string>();
  if (serverActive) next.add(serverActive);
  if (prev.size === next.size && [...prev].every((t) => next.has(t))) return prev;
  return next;
}

/**
 * One polling pass: fetch /status, extract the server's `activeRun`, and hand the
 * reconciled in-flight set to `setInFlight`. Best-effort — any error is swallowed.
 * `isCancelled` lets the caller abort the commit if the effect has torn down.
 */
async function pollInFlightOnce(
  isCancelled: () => boolean,
  setInFlight: (updater: (prev: Set<string>) => Set<string>) => void
): Promise<void> {
  try {
    const res = await fetch('/api/maintenance/status');
    if (!res.ok) return;
    const body = (await res.json()) as { activeRun?: { taskId: string } | null };
    if (isCancelled()) return;
    const serverActive = body?.activeRun?.taskId ?? null;
    setInFlight((prev) => reconcileInFlight(prev, serverActive));
  } catch {
    // Polling is best-effort; transient errors are fine to swallow.
  }
}

/** Apply a maintenance WS event to the in-flight set (started adds, completed/error removes). */
function applyMaintenanceEventToInFlight(
  event: NonNullable<ReturnType<typeof useOrchestratorSocket>['maintenanceEvent']>,
  setInFlight: (updater: (prev: Set<string>) => Set<string>) => void
): void {
  if (event.type === 'maintenance:started') {
    setInFlight((prev) => withAdded(prev, event.data.taskId));
  } else if (event.type === 'maintenance:completed' || event.type === 'maintenance:error') {
    setInFlight((prev) => withRemoved(prev, event.data.taskId));
  }
  // 'maintenance:baseref_fallback' is informational; do not touch inFlight.
}

/** Map a load error message to the user-facing string (orchestrator-down hint vs raw message). */
function loadErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : 'Network error';
  if (msg.includes('404') || msg.includes('502')) {
    return 'Orchestrator not running. Start with: harness orchestrator run';
  }
  return msg;
}

/** Map a schedule-fetch failure to the next {schedule, scheduleError} state. */
function scheduleFailureState(e: unknown): {
  schedule: ScheduleRow[] | null;
  error: string | null;
} {
  if (e instanceof ScheduleNotImplementedError) {
    // Older orchestrator without the schedule route — degrade silently.
    return { schedule: [], error: null };
  }
  const msg = e instanceof Error ? e.message : 'Network error';
  return { schedule: null, error: `Failed to load schedule: ${msg}` };
}

/**
 * Polling fallback: while the WebSocket is disconnected we cannot rely on
 * maintenance:started/completed events to keep `inFlight` honest. Poll /status
 * every ~5s (plus an immediate tick) and reconcile against the server's
 * authoritative `activeRun`. No-op while connected.
 */
function useInFlightPolling(
  connected: boolean,
  setInFlight: (updater: (prev: Set<string>) => Set<string>) => void
): void {
  useEffect(() => {
    if (connected) return;
    let cancelled = false;
    const tick = (): void => {
      void pollInFlightOnce(() => cancelled, setInFlight);
    };
    const id = setInterval(tick, 5000);
    tick(); // immediate tick so the user does not wait a full interval
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connected, setInFlight]);
}

export interface MaintenanceData {
  status: SchedulerStatus | null;
  history: HistoryEntry[] | null;
  schedule: ScheduleRow[] | null;
  scheduleError: string | null;
  inFlight: Set<string>;
  error: string | null;
  loading: boolean;
  connected: boolean;
  maintenanceEvent: ReturnType<typeof useOrchestratorSocket>['maintenanceEvent'];
  handleRunNow: (taskId: string) => void;
}

/**
 * Owns all maintenance-page data flow: initial load, WebSocket-driven refetch,
 * in-flight tracking (event-driven + polling fallback), and manual triggers.
 * Extracted from the page component so the render function stays flat.
 */
/** Status/history/schedule fetch state plus the `load` action that populates it. */
function useMaintenanceLoaders() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [schedule, setSchedule] = useState<ScheduleRow[] | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadScheduleOnly = useCallback(async () => {
    // Fetched independently so its absence (older orchestrator) does not block
    // status/history rendering.
    try {
      const sched = await fetchSchedule();
      setSchedule(sched);
      setScheduleError(null);
    } catch (e) {
      const next = scheduleFailureState(e);
      setSchedule(next.schedule);
      setScheduleError(next.error);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([fetchStatus(), fetchHistory()]);
      setStatus(s);
      setHistory(h);
      setError(null);
    } catch (e) {
      setError(loadErrorMessage(e));
    } finally {
      setLoading(false);
    }
    await loadScheduleOnly();
  }, [loadScheduleOnly]);

  return { status, history, schedule, scheduleError, error, loading, setError, load };
}

export function useMaintenanceData(): MaintenanceData {
  const { status, history, schedule, scheduleError, error, loading, setError, load } =
    useMaintenanceLoaders();
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  const { maintenanceEvent, connected } = useOrchestratorSocket();

  // Initial load + refetch whenever a maintenance WS event arrives.
  useEffect(() => {
    void load();
  }, [load, maintenanceEvent]);

  // Track in-flight task IDs from started/completed/error events.
  useEffect(() => {
    if (maintenanceEvent) applyMaintenanceEventToInFlight(maintenanceEvent, setInFlight);
  }, [maintenanceEvent]);

  useInFlightPolling(connected, setInFlight);

  const handleRunNow = useCallback(
    (taskId: string) => {
      setInFlight((prev) => withAdded(prev, taskId));
      triggerRun(taskId).catch((e: unknown) => {
        setError(e instanceof Error ? e.message : `Failed to trigger ${taskId}`);
        // On a network failure, clear in-flight so the user can retry.
        setInFlight((prev) => withRemoved(prev, taskId));
      });
    },
    [setError]
  );

  return {
    status,
    history,
    schedule,
    scheduleError,
    inFlight,
    error,
    loading,
    connected,
    maintenanceEvent,
    handleRunNow,
  };
}
