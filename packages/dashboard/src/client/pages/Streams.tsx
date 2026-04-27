import { useState, useEffect, useCallback } from 'react';
import { AgentStreamDrawer } from '../components/agents/AgentStreamDrawer';

/* ------------------------------------------------------------------ */
/*  Inline types — mirrors StreamManifest from useStreamReplay        */
/* ------------------------------------------------------------------ */

interface AttemptStats {
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  turnCount: number;
  toolsCalled: string[];
  filesTouched: string[];
}

interface Attempt {
  attempt: number;
  startedAt: string;
  endedAt: string | null;
  outcome: string | null;
  stats: AttemptStats;
}

interface StreamSession {
  issueId: string;
  externalId: number | string | null;
  identifier: string;
  attempts: Attempt[];
  pr: { number: number; linkedAt: string; status: string } | null;
  highlights: {
    extractedAt: string;
    postedToPr: boolean;
    moments: Array<{ timestamp: string; summary: string; category: string }>;
  } | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const minutes = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (minutes < 60) return `${minutes}m ${remSecs}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

/* ------------------------------------------------------------------ */
/*  Fetch                                                              */
/* ------------------------------------------------------------------ */

async function fetchStreams(): Promise<StreamSession[]> {
  const res = await fetch('/api/streams');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as StreamSession[];
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium bg-blue-900/50 text-blue-400">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
        running
      </span>
    );
  }
  const colorMap: Record<string, string> = {
    normal: 'bg-emerald-900/50 text-emerald-400',
    error: 'bg-red-900/50 text-red-400',
    timeout: 'bg-orange-900/50 text-orange-400',
  };
  const color = colorMap[outcome] ?? 'bg-gray-800 text-gray-400';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {outcome}
    </span>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">{title}</h2>
  );
}

function SessionRow({ session, onSelect }: { session: StreamSession; onSelect: () => void }) {
  const lastAttempt = session.attempts.at(-1);
  const startedAt = lastAttempt?.startedAt;
  const outcome = lastAttempt?.outcome ?? null;
  const stats = lastAttempt?.stats;
  const eventCount = stats ? stats.turnCount : 0;
  const totalTokens = stats ? stats.inputTokens + stats.outputTokens : 0;

  return (
    <tr
      onClick={onSelect}
      className="border-b border-gray-800 cursor-pointer transition-colors hover:bg-gray-800/40"
    >
      <td className="py-3 px-3 font-mono text-xs text-gray-200 max-w-[180px] truncate">
        {session.issueId}
      </td>
      <td className="py-3 px-3 text-sm text-white truncate max-w-[220px]">{session.identifier}</td>
      <td className="py-3 px-3">
        <OutcomeBadge outcome={outcome} />
      </td>
      <td className="py-3 px-3 text-xs text-gray-400">{startedAt ? formatDate(startedAt) : '-'}</td>
      <td className="py-3 px-3 text-right tabular-nums text-gray-400 text-xs">
        {startedAt ? formatTimeAgo(startedAt) : '-'}
      </td>
      <td className="py-3 px-3 text-right tabular-nums text-gray-300 text-xs">
        {eventCount} turns
      </td>
      <td className="py-3 px-3 text-right tabular-nums text-yellow-400 text-xs">
        {formatTokens(totalTokens)}
      </td>
      <td className="py-3 px-3 text-right tabular-nums text-gray-400 text-xs">
        {stats && stats.durationMs > 0 ? formatDuration(stats.durationMs) : '-'}
      </td>
      <td className="py-3 px-3 text-right text-gray-500 text-xs">
        {session.attempts.length > 1 ? `${session.attempts.length} attempts` : ''}
        {session.pr ? <span className="ml-2 text-blue-400">PR #{session.pr.number}</span> : null}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export function Streams() {
  const [sessions, setSessions] = useState<StreamSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerIssueId, setDrawerIssueId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchStreams();
      setSessions(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Refresh every 30 seconds
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const closeDrawer = () => setDrawerIssueId(null);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Streams</h1>
        <div className="flex items-center gap-4">
          {sessions.length > 0 && (
            <span className="text-xs text-gray-500">
              {sessions.length} recorded session{sessions.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            className="rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && sessions.length === 0 && (
        <p className="text-sm text-gray-500">Loading streams...</p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && !error && sessions.length === 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center">
          <p className="text-sm text-gray-500">
            No recorded streams yet. Sessions will appear here after agents run.
          </p>
        </div>
      )}

      {sessions.length > 0 && (
        <section>
          <SectionHeader title="Recorded Sessions" />
          <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/60">
                  <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Session ID
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Identifier
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Status
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Started At
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Age
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Turns
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Tokens
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Duration
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Info
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <SessionRow
                    key={s.issueId}
                    session={s}
                    onSelect={() => setDrawerIssueId(s.issueId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <AgentStreamDrawer agent={null} issueId={drawerIssueId} blocks={[]} onClose={closeDrawer} />
    </div>
  );
}
