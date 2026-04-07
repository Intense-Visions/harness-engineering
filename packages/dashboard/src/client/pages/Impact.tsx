import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import type {
  AnomalyData,
  AnomalyArticulationPoint,
  AnomalyOutlier,
  BlastRadiusResult,
} from '@shared/types';
import { isBlastRadiusData } from '../utils/typeGuards';
import { BlastRadiusGraph } from '../components/BlastRadiusGraph';

const DEPTH_OPTIONS = [1, 2, 3, 4, 5] as const;
const DEFAULT_DEPTH = 3;

export function Impact() {
  const [anomalies, setAnomalies] = useState<AnomalyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [depth, setDepth] = useState(DEFAULT_DEPTH);

  const blastRadius = useApi<{ data: BlastRadiusResult }>('/api/impact/blast-radius');

  // Fetch anomalies on mount
  const fetchAnomalies = useCallback(async () => {
    try {
      const res = await fetch('/api/impact/anomalies');
      if (!res.ok) {
        setFetchError(`HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { data: AnomalyData };
      setAnomalies(body.data);
      setFetchError(null);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAnomalies();
  }, [fetchAnomalies]);

  const queryBlastRadius = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      void blastRadius.run({ nodeId, maxDepth: depth });
    },
    [blastRadius, depth]
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = searchText.trim();
      if (trimmed) {
        queryBlastRadius(trimmed);
      }
    },
    [searchText, queryBlastRadius]
  );

  const handleAnomalyClick = useCallback(
    (nodeId: string) => {
      setSearchText('');
      queryBlastRadius(nodeId);
    },
    [queryBlastRadius]
  );

  // Sort anomalies for display
  const sortedAPs = anomalies
    ? [...anomalies.articulationPoints].sort((a, b) => b.dependentCount - a.dependentCount)
    : [];
  const sortedOutliers = anomalies
    ? [...anomalies.outliers].sort((a, b) => b.zScore - a.zScore)
    : [];

  const brData = blastRadius.data?.data;
  const brIsData = brData && isBlastRadiusData(brData);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Impact Explorer</h1>

      {/* Top bar: search + depth */}
      <div className="mb-6 flex items-center gap-4">
        <form onSubmit={handleSearch} className="flex flex-1 gap-2">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search node by name or path..."
            className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-gray-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-700"
          >
            Search
          </button>
        </form>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          Depth
          <select
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-200"
          >
            {DEPTH_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left panel: anomaly list */}
        <div className="lg:col-span-1">
          {loading && !anomalies && <p className="text-sm text-gray-500">Loading anomalies...</p>}
          {fetchError && <p className="text-sm text-red-400">{fetchError}</p>}

          {anomalies && sortedAPs.length === 0 && sortedOutliers.length === 0 && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <p className="text-base font-medium text-gray-300">No anomalies detected</p>
              <p className="mt-2 text-sm text-gray-500">
                Run &quot;harness graph scan&quot; to build the knowledge graph, then restart the
                dashboard.
              </p>
            </div>
          )}

          {/* Articulation points */}
          {sortedAPs.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
                Articulation Points
              </h2>
              <div className="space-y-1">
                {sortedAPs.map((ap: AnomalyArticulationPoint) => (
                  <button
                    key={ap.nodeId}
                    onClick={() => handleAnomalyClick(ap.nodeId)}
                    className={[
                      'w-full rounded border px-3 py-2 text-left text-sm transition-colors',
                      selectedNodeId === ap.nodeId
                        ? 'border-blue-700 bg-blue-950'
                        : 'border-gray-800 bg-gray-900 hover:bg-gray-800',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate font-medium text-gray-200">{ap.name}</span>
                      <span className="ml-2 text-xs tabular-nums text-gray-500">
                        {ap.dependentCount} deps
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {ap.componentsIfRemoved} components if removed
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Outliers */}
          {sortedOutliers.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
                Statistical Outliers
              </h2>
              <div className="space-y-1">
                {sortedOutliers.map((o: AnomalyOutlier) => (
                  <button
                    key={o.nodeId}
                    onClick={() => handleAnomalyClick(o.nodeId)}
                    className={[
                      'w-full rounded border px-3 py-2 text-left text-sm transition-colors',
                      selectedNodeId === o.nodeId
                        ? 'border-blue-700 bg-blue-950'
                        : 'border-gray-800 bg-gray-900 hover:bg-gray-800',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate font-medium text-gray-200">{o.name}</span>
                      <span className="ml-2 text-xs tabular-nums text-gray-500">
                        z={o.zScore.toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {o.metric}: {o.value} ({o.type})
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right panel: blast radius placeholder */}
        <div className="lg:col-span-2">
          {!selectedNodeId && blastRadius.state === 'idle' && (
            <div className="flex h-64 items-center justify-center rounded-lg border border-gray-800 bg-gray-900">
              <p className="text-sm text-gray-500">Select a node or search to view blast radius</p>
            </div>
          )}

          {blastRadius.state === 'loading' && (
            <div className="flex h-64 items-center justify-center rounded-lg border border-gray-800 bg-gray-900">
              <p className="text-sm text-gray-500">Computing blast radius...</p>
            </div>
          )}

          {blastRadius.state === 'error' && blastRadius.error && (
            <div className="rounded-lg border border-red-800 bg-gray-900 p-6">
              <p className="text-sm text-red-400">{blastRadius.error}</p>
            </div>
          )}

          {blastRadius.state === 'success' && brData && !brIsData && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <p className="text-sm text-gray-400">
                {'error' in brData ? (brData as { error: string }).error : 'No blast radius data'}
              </p>
            </div>
          )}

          {blastRadius.state === 'success' && brIsData && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-200">
                Blast Radius: {brData.sourceName}
              </h3>
              <BlastRadiusGraph data={brData} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
