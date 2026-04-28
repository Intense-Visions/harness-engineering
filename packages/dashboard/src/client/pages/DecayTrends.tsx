import { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { KpiCard } from '../components/KpiCard';

type Direction = 'improving' | 'stable' | 'declining';

interface TrendLine {
  current: number;
  previous: number;
  delta: number;
  direction: Direction;
}

interface TrendResult {
  stability: TrendLine;
  categories: Record<string, TrendLine>;
  snapshotCount: number;
  from: string;
  to: string;
}

function directionLabel(direction: Direction): string {
  if (direction === 'improving') return 'Improving';
  if (direction === 'declining') return 'Degrading';
  return 'Stable';
}

function directionAccent(direction: Direction): 'green' | 'yellow' | 'red' {
  if (direction === 'improving') return 'green';
  if (direction === 'declining') return 'red';
  return 'yellow';
}

function directionColorClass(direction: Direction): string {
  if (direction === 'improving') return 'text-emerald-400';
  if (direction === 'declining') return 'text-red-400';
  return 'text-yellow-400';
}

function directionArrow(direction: Direction): string {
  if (direction === 'improving') return '\u2193'; // down arrow (fewer violations = better)
  if (direction === 'declining') return '\u2191'; // up arrow (more violations = worse)
  return '\u2192'; // right arrow (stable)
}

function formatDelta(delta: number): string {
  if (delta === 0) return '0';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}`;
}

function formatCategory(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const CategoryRow = memo(function CategoryRow({ name, trend }: { name: string; trend: TrendLine }) {
  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/40">
      <td className="py-2 px-3 font-mono text-xs text-gray-200">{formatCategory(name)}</td>
      <td className="py-2 px-3 text-right tabular-nums text-gray-200">
        {trend.current.toFixed(1)}
      </td>
      <td className={`py-2 px-3 text-right tabular-nums ${directionColorClass(trend.direction)}`}>
        {directionArrow(trend.direction)} {directionLabel(trend.direction)}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-gray-400">
        {formatDelta(trend.delta)}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-gray-500">
        {trend.previous.toFixed(1)}
      </td>
    </tr>
  );
});

function CategoriesTable({ categories }: { categories: Record<string, TrendLine> }) {
  // Sort by absolute delta descending (most change first)
  const sorted = useMemo(
    () => Object.entries(categories).sort((a, b) => Math.abs(b[1].delta) - Math.abs(a[1].delta)),
    [categories]
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center">
        <p className="text-sm text-gray-500">
          No category data yet. Capture architecture snapshots to see trends.
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
              Category
            </th>
            <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
              Current
            </th>
            <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
              Trend
            </th>
            <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
              Delta
            </th>
            <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
              Previous
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([name, trend]) => (
            <CategoryRow key={name} name={name} trend={trend} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function fetchDecayTrends(): Promise<TrendResult> {
  const res = await fetch('/api/decay-trends');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data: TrendResult };
  return body.data;
}

export function DecayTrends() {
  const [trends, setTrends] = useState<TrendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchDecayTrends();
      setTrends(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isEmpty = trends && trends.snapshotCount === 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Decay Trends</h1>
        {trends && trends.to && (
          <span className="text-xs text-gray-500">
            {trends.snapshotCount} snapshot{trends.snapshotCount !== 1 ? 's' : ''} analyzed
            {trends.from && ` from ${trends.from.slice(0, 10)} to ${trends.to.slice(0, 10)}`}
          </span>
        )}
      </div>

      {loading && !trends && <p className="text-sm text-gray-500">Loading decay trends...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {isEmpty && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center">
          <p className="text-sm text-gray-500">
            No architecture snapshots found. Run{' '}
            <code className="text-gray-400">harness snapshot capture</code> to create the first
            snapshot.
          </p>
        </div>
      )}

      {trends && !isEmpty && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Overview
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard
                label="Stability Score"
                value={trends.stability.current}
                sub="0-100 (higher is healthier)"
                accent={directionAccent(trends.stability.direction)}
              />
              <KpiCard
                label="Trend Direction"
                value={directionLabel(trends.stability.direction)}
                accent={directionAccent(trends.stability.direction)}
              />
              <KpiCard
                label="Score Delta"
                value={formatDelta(trends.stability.delta)}
                sub={`Previous: ${trends.stability.previous}`}
                accent={directionAccent(trends.stability.direction)}
              />
              <KpiCard label="Snapshots" value={trends.snapshotCount} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Category Breakdown
            </h2>
            <CategoriesTable categories={trends.categories} />
          </section>
        </div>
      )}
    </div>
  );
}
