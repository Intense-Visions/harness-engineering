import { useSSE } from '../hooks/useSSE';
import { KpiCard } from '../components/KpiCard';
import { StaleIndicator } from '../components/StaleIndicator';
import { ActionButton } from '../components/ActionButton';
import type { OverviewData } from '@shared/types';
import { SSE_ENDPOINT } from '@shared/constants';
import {
  isRoadmapData,
  isHealthData,
  isGraphData,
  isSecurityData,
  isPerfData,
  isArchData,
} from '../utils/typeGuards';

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">{title}</h2>
  );
}

function SectionUnavailable({ data }: { data: unknown }) {
  return (
    <p className="text-sm text-gray-500">
      {data && typeof data === 'object' && 'error' in data
        ? (data as { error: string }).error
        : 'Unavailable'}
    </p>
  );
}

function SectionError({ data }: { data: unknown }) {
  if (data && typeof data === 'object' && 'error' in data) {
    return <p className="text-sm text-red-400">{(data as { error: string }).error}</p>;
  }
  return <p className="text-sm text-gray-500">Awaiting first scan...</p>;
}

function RoadmapSection({ roadmap }: { roadmap: unknown }) {
  return (
    <section>
      <SectionHeader title="Roadmap" />
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
        <SectionUnavailable data={roadmap} />
      )}
    </section>
  );
}

function HealthSection({ health }: { health: unknown }) {
  return (
    <section>
      <SectionHeader title="Codebase Health" />
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
        <SectionUnavailable data={health} />
      )}
    </section>
  );
}

function SecuritySection({ security }: { security: unknown }) {
  return (
    <section>
      <SectionHeader title="Security" />
      {security && isSecurityData(security) ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard
            label="Status"
            value={security.valid ? 'OK' : 'Issues Found'}
            accent={security.valid ? 'green' : 'red'}
          />
          <KpiCard
            label="Errors"
            value={security.stats.errorCount}
            accent={security.stats.errorCount > 0 ? 'red' : 'default'}
          />
          <KpiCard
            label="Warnings"
            value={security.stats.warningCount}
            accent={security.stats.warningCount > 0 ? 'yellow' : 'default'}
          />
          <KpiCard label="Files Scanned" value={security.stats.filesScanned} />
        </div>
      ) : (
        <SectionError data={security} />
      )}
    </section>
  );
}

function PerfSection({ perf }: { perf: unknown }) {
  return (
    <section>
      <SectionHeader title="Performance" />
      {perf && isPerfData(perf) ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiCard
            label="Status"
            value={perf.valid ? 'OK' : 'Violations'}
            accent={perf.valid ? 'green' : 'red'}
          />
          <KpiCard
            label="Violations"
            value={perf.stats.violationCount}
            accent={perf.stats.violationCount > 0 ? 'red' : 'default'}
          />
          <KpiCard label="Files Analyzed" value={perf.stats.filesAnalyzed} />
        </div>
      ) : (
        <SectionError data={perf} />
      )}
    </section>
  );
}

function ArchSection({ arch }: { arch: unknown }) {
  return (
    <section>
      <SectionHeader title="Architecture" />
      {arch && isArchData(arch) ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiCard
            label="Status"
            value={arch.passed ? 'Passed' : 'Failed'}
            accent={arch.passed ? 'green' : 'red'}
          />
          <KpiCard
            label="Violations"
            value={arch.totalViolations}
            accent={arch.totalViolations > 0 ? 'red' : 'default'}
          />
          <KpiCard
            label="Regressions"
            value={arch.regressions.length}
            accent={arch.regressions.length > 0 ? 'yellow' : 'default'}
          />
        </div>
      ) : (
        <SectionError data={arch} />
      )}
    </section>
  );
}

function GraphSection({ graph }: { graph: unknown }) {
  return (
    <section>
      <SectionHeader title="Knowledge Graph" />
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
          {(() => {
            const g = graph as Record<string, unknown> | null;
            return g && !g.available && typeof g.reason === 'string' ? (
              <p className="mt-1 text-xs text-gray-600">{g.reason}</p>
            ) : null;
          })()}
        </div>
      )}
    </section>
  );
}

export function Overview() {
  const { data, lastUpdated, stale, error } = useSSE(SSE_ENDPOINT, 'overview');
  const { data: checksData } = useSSE(SSE_ENDPOINT, 'checks');

  const roadmap = data ? data.roadmap : null;
  const health = data ? data.health : null;
  const graph = data ? data.graph : null;

  const security = checksData ? checksData.security : null;
  const perf = checksData ? checksData.perf : null;
  const arch = checksData ? checksData.arch : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Overview</h1>
        <div className="flex items-center gap-4">
          <ActionButton
            url="/api/actions/validate"
            label="Run Validate"
            loadingLabel="Validating..."
          />
          <ActionButton
            url="/api/actions/regen-charts"
            label="Regen Charts"
            loadingLabel="Regenerating..."
          />
          <StaleIndicator lastUpdated={lastUpdated} stale={stale} error={error} />
        </div>
      </div>

      {!data && !error && <p className="text-sm text-gray-500">Connecting to data stream...</p>}

      {data && (
        <div className="space-y-8">
          <RoadmapSection roadmap={roadmap} />
          <HealthSection health={health} />
          <SecuritySection security={security} />
          <PerfSection perf={perf} />
          <ArchSection arch={arch} />
          <GraphSection graph={graph} />
        </div>
      )}
    </div>
  );
}
