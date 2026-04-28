import { memo, useMemo } from 'react';
import { useSSE } from '../hooks/useSSE';
import { KpiCard } from '../components/KpiCard';
import { StaleIndicator } from '../components/StaleIndicator';
import { SSE_ENDPOINT } from '@shared/constants';
import { isGraphData } from '../utils/typeGuards';
import type { GraphData } from '@shared/types';

function GraphNotConnected({ reason }: { reason?: string | undefined }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
      <p className="text-base font-medium text-gray-300">Graph not connected</p>
      {reason && <p className="mt-2 text-sm text-gray-500">{reason}</p>}
      <div className="mt-4 rounded border border-gray-700 bg-gray-950 p-4">
        <p className="text-xs font-semibold text-gray-400">To connect the graph:</p>
        <ol className="mt-2 list-decimal list-inside space-y-1 text-xs text-gray-500">
          <li>
            Run <code className="text-gray-300">harness ingest</code> to build the knowledge graph
          </li>
          <li>Ensure the graph database is available in your project</li>
          <li>Restart the dashboard to reconnect</li>
        </ol>
      </div>
    </div>
  );
}

const NodeTypeRow = memo(function NodeTypeRow({
  type,
  count,
  pct,
}: {
  type: string;
  count: number;
  pct: string;
}) {
  return (
    <tr className="hover:bg-gray-900">
      <td className="px-4 py-2.5 text-gray-300">{type}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{count}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{pct}%</td>
    </tr>
  );
});

const NodeTypeTable = memo(function NodeTypeTable({
  nodesByType,
  nodeCount,
}: Pick<GraphData, 'nodesByType' | 'nodeCount'>) {
  const sortedNodes = useMemo(
    () => [...nodesByType].sort((a, b) => b.count - a.count),
    [nodesByType]
  );

  if (nodesByType.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Node Type Breakdown
      </h2>
      <div className="overflow-hidden rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-right">Count</th>
              <th className="px-4 py-3 text-right">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 bg-gray-950">
            {sortedNodes.map((row) => {
              const pct = nodeCount > 0 ? ((row.count / nodeCount) * 100).toFixed(1) : '0';
              return <NodeTypeRow key={row.type} type={row.type} count={row.count} pct={pct} />;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
});

const GraphMetrics = memo(function GraphMetrics({ graphData }: { graphData: GraphData }) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Graph Metrics
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiCard label="Nodes" value={graphData.nodeCount} />
          <KpiCard label="Edges" value={graphData.edgeCount} />
          <KpiCard label="Node Types" value={graphData.nodesByType.length} />
        </div>
      </section>
      <NodeTypeTable nodesByType={graphData.nodesByType} nodeCount={graphData.nodeCount} />
    </div>
  );
});

export function Graph() {
  const { data, lastUpdated, stale, error } = useSSE(SSE_ENDPOINT, 'overview');

  const graph = data ? data.graph : null;
  const graphData = graph && isGraphData(graph) ? graph : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Knowledge Graph</h1>
        <StaleIndicator lastUpdated={lastUpdated} stale={stale} error={error} />
      </div>

      {!data && !error && <p className="text-sm text-gray-500">Connecting to data stream…</p>}

      {graph && !graphData && (
        <GraphNotConnected reason={!graph.available ? graph.reason : undefined} />
      )}

      {graphData && <GraphMetrics graphData={graphData} />}
    </div>
  );
}
