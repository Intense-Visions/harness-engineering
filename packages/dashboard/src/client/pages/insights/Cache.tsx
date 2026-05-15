import { useEffect, useState } from 'react';

/**
 * Phase 5 Task 12 — Prompt-cache insights widget.
 *
 * Renders the live `PromptCacheStats` snapshot from
 * `GET /api/v1/telemetry/cache/stats`. Polls at 5 s — cache hit-rate moves
 * slowly (it's an aggregate of the last 1000 Anthropic calls) and a tighter
 * cadence would generate request noise for no benefit.
 *
 * The sparkline is client-side state only (no localStorage) — refreshing
 * the page resets the history. That's acceptable since the underlying
 * recorder is also in-memory; both restart together.
 */

interface BackendBreakdown {
  hits: number;
  misses: number;
}

interface PromptCacheStats {
  totalRequests: number;
  hits: number;
  misses: number;
  hitRate: number;
  byBackend: Record<string, BackendBreakdown>;
  windowStartedAt: number;
}

const POLL_INTERVAL_MS = 5000;
const SPARKLINE_HISTORY_LIMIT = 60; // last ~5 minutes at 5 s cadence

/**
 * Tiny dependency-free SVG sparkline. Plots `values` (0..1 range) into an
 * inline polyline scaled to the supplied width/height. Empty history is
 * rendered as a flat zero line so the chart never disappears once the
 * widget has data.
 */
function Sparkline({
  values,
  width = 240,
  height = 36,
}: {
  values: number[];
  width?: number;
  height?: number;
}): JSX.Element {
  if (values.length === 0) {
    return <svg width={width} height={height} aria-label="empty sparkline" />;
  }
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - Math.max(0, Math.min(1, v)) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`hit-rate trend over last ${values.length} samples`}
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

export function Cache(): JSX.Element {
  const [stats, setStats] = useState<PromptCacheStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    let mounted = true;

    async function fetchStats(): Promise<void> {
      try {
        const res = await fetch('/api/v1/telemetry/cache/stats');
        if (!mounted) return;
        if (!res.ok) {
          // 503 → no recorder wired. Don't spam; surface a soft empty state.
          if (res.status === 503) {
            setStats(null);
            setError(null);
          } else {
            setError(`Failed to load (${res.status})`);
          }
          return;
        }
        const body = (await res.json()) as PromptCacheStats;
        if (!mounted) return;
        setStats(body);
        setError(null);
        // Push hitRate onto sparkline buffer; trim to history limit.
        setHistory((prev) => {
          const next = [...prev, body.hitRate];
          return next.length > SPARKLINE_HISTORY_LIMIT
            ? next.slice(next.length - SPARKLINE_HISTORY_LIMIT)
            : next;
        });
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Network error');
      }
    }

    void fetchStats();
    const id = setInterval(() => void fetchStats(), POLL_INTERVAL_MS);
    return (): void => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  if (error) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-bold">Prompt Cache</h1>
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (stats === null || stats.totalRequests === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-bold">Prompt Cache</h1>
        <p className="text-sm text-neutral-muted">No prompt-cache activity recorded yet</p>
      </div>
    );
  }

  const percent = (stats.hitRate * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Prompt Cache</h1>

      <div className="rounded-lg border border-white/10 p-4" data-testid="cache-hitrate-card">
        <p className="text-xs uppercase tracking-wider text-neutral-muted">Hit rate</p>
        <div className="mt-1 flex items-baseline gap-4">
          <div className="text-5xl font-bold" data-testid="cache-hitrate-value">
            {percent}%
          </div>
          <div className="text-xs text-neutral-muted">
            {stats.hits} hits / {stats.misses} misses / {stats.totalRequests} total
          </div>
        </div>
        <div className="mt-3 text-blue-400">
          <Sparkline values={history} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 p-4">
        <h2 className="mb-2 text-sm font-semibold">By backend</h2>
        <table className="w-full text-sm" data-testid="cache-backend-table">
          <thead className="text-xs uppercase text-neutral-muted">
            <tr>
              <th className="px-2 py-1 text-left">Backend</th>
              <th className="px-2 py-1 text-right">Hits</th>
              <th className="px-2 py-1 text-right">Misses</th>
              <th className="px-2 py-1 text-right">Hit rate</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(stats.byBackend).map(([backend, b]) => {
              const total = b.hits + b.misses;
              const rate = total === 0 ? 0 : b.hits / total;
              return (
                <tr key={backend} className="border-t border-white/5">
                  <td className="px-2 py-1 font-mono text-xs">{backend}</td>
                  <td className="px-2 py-1 text-right">{b.hits}</td>
                  <td className="px-2 py-1 text-right">{b.misses}</td>
                  <td className="px-2 py-1 text-right">{(rate * 100).toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
