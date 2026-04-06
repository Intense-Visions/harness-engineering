import { useSSE } from '../hooks/useSSE';
import { KpiCard } from '../components/KpiCard';
import { StaleIndicator } from '../components/StaleIndicator';
import { ActionButton } from '../components/ActionButton';
import type { OverviewData } from '@shared/types';
import { SSE_ENDPOINT } from '@shared/constants';
import { isRoadmapData, isHealthData, isGraphData } from '../utils/typeGuards';

export function Overview() {
  const { data, lastUpdated, stale, error } = useSSE(SSE_ENDPOINT, 'overview');

  const roadmap = data ? data.roadmap : null;
  const health = data ? data.health : null;
  const graph = data ? data.graph : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Overview</h1>
        <div className="flex items-center gap-4">
          <ActionButton
            url="/api/actions/validate"
            label="Run Validate"
            loadingLabel="Validating…"
          />
          <ActionButton
            url="/api/actions/regen-charts"
            label="Regen Charts"
            loadingLabel="Regenerating…"
          />
          <StaleIndicator lastUpdated={lastUpdated} stale={stale} error={error} />
        </div>
      </div>

      {!data && !error && <p className="text-sm text-gray-500">Connecting to data stream…</p>}

      {data && (
        <div className="space-y-8">
          {/* Roadmap KPIs */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Roadmap
            </h2>
            {roadmap && isRoadmapData(roadmap) ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <KpiCard label="Total" value={roadmap.totalFeatures} />
                <KpiCard label="Done" value={roadmap.totalDone} accent="green" />
                <KpiCard label="In Progress" value={roadmap.totalInProgress} accent="yellow" />
                <KpiCard label="Planned" value={roadmap.totalPlanned} />
                <KpiCard
                  label="Blocked"
                  value={roadmap.totalBlocked}
                  accent={roadmap.totalBlocked > 0 ? 'red' : 'default'}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                {roadmap && 'error' in roadmap ? roadmap.error : 'Unavailable'}
              </p>
            )}
          </section>

          {/* Health KPIs */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Codebase Health
            </h2>
            {health && isHealthData(health) ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <KpiCard
                  label="Total Issues"
                  value={health.totalIssues}
                  accent={health.totalIssues > 0 ? 'yellow' : 'green'}
                />
                <KpiCard
                  label="Errors"
                  value={health.errors}
                  accent={health.errors > 0 ? 'red' : 'default'}
                />
                <KpiCard
                  label="Warnings"
                  value={health.warnings}
                  accent={health.warnings > 0 ? 'yellow' : 'default'}
                />
                <KpiCard
                  label="Auto-fixable"
                  value={health.fixableCount}
                  sub={`${health.durationMs} ms scan`}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                {health && 'error' in health ? health.error : 'Unavailable'}
              </p>
            )}
          </section>

          {/* Graph KPIs */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Knowledge Graph
            </h2>
            {graph && isGraphData(graph) ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <KpiCard label="Nodes" value={graph.nodeCount} />
                <KpiCard label="Edges" value={graph.edgeCount} />
                <KpiCard
                  label="Node Types"
                  value={graph.nodesByType.length}
                  sub={graph.nodesByType.map((n) => `${n.type}: ${n.count}`).join(', ')}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
                <p className="text-sm text-gray-400">Graph not connected</p>
                {graph && !graph.available && (
                  <p className="mt-1 text-xs text-gray-600">{graph.reason}</p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
