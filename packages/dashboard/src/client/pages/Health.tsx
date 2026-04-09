import { useState } from 'react';
import { useSSE } from '../hooks/useSSE';
import { KpiCard } from '../components/KpiCard';
import { StaleIndicator } from '../components/StaleIndicator';
import { SSE_ENDPOINT } from '@shared/constants';
import { isHealthData, isSecurityData, isPerfData, isArchData } from '../utils/typeGuards';
import type { HealthData, SecurityData, PerfData, ArchData, OverviewData, ChecksData } from '@shared/types';

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        onClick={() => setOpen(!open)}
        className="mb-3 flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <span className="text-xs text-gray-500">{open ? '\u25BC' : '\u25B6'}</span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">{title}</h2>
      </button>
      {open && children}
    </section>
  );
}

function SecuritySection({ data }: { data: SecurityData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Errors"
          value={data.stats.errorCount}
          accent={data.stats.errorCount > 0 ? 'red' : 'green'}
        />
        <KpiCard
          label="Warnings"
          value={data.stats.warningCount}
          accent={data.stats.warningCount > 0 ? 'yellow' : 'default'}
        />
        <KpiCard label="Info" value={data.stats.infoCount} />
        <KpiCard label="Files Scanned" value={data.stats.filesScanned} />
      </div>
      {data.findings.length > 0 && (
        <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Top Findings
          </p>
          {data.findings.slice(0, 10).map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span
                className={
                  f.severity === 'error'
                    ? 'text-red-400'
                    : f.severity === 'warning'
                      ? 'text-yellow-400'
                      : 'text-gray-400'
                }
              >
                [{f.severity}]
              </span>
              <span className="text-gray-300">
                {f.file}:{f.line}
              </span>
              <span className="text-gray-500">{f.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PerfSection({ data }: { data: PerfData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Violations"
          value={data.stats.violationCount}
          accent={data.stats.violationCount > 0 ? 'red' : 'green'}
        />
        <KpiCard label="Files Analyzed" value={data.stats.filesAnalyzed} />
        <KpiCard
          label="Status"
          value={data.valid ? 'OK' : 'Failing'}
          accent={data.valid ? 'green' : 'red'}
        />
      </div>
      {data.violations.length > 0 && (
        <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Violations
          </p>
          {data.violations.map((v, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={v.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}>
                [{v.severity}]
              </span>
              <span className="text-gray-300">{v.file}</span>
              <span className="text-gray-500">
                {v.metric}: {v.value} (threshold: {v.threshold})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArchSection({ data }: { data: ArchData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Status"
          value={data.passed ? 'Passed' : 'Failed'}
          accent={data.passed ? 'green' : 'red'}
        />
        <KpiCard
          label="Violations"
          value={data.totalViolations}
          accent={data.totalViolations > 0 ? 'red' : 'default'}
        />
        <KpiCard
          label="Regressions"
          value={data.regressions.length}
          accent={data.regressions.length > 0 ? 'yellow' : 'default'}
        />
      </div>
      {data.newViolations.length > 0 && (
        <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            New Violations
          </p>
          {data.newViolations.map((v, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={v.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}>
                [{v.severity}]
              </span>
              <span className="text-gray-300">{v.file}</span>
              <span className="text-gray-500">{v.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EntropySection({ healthData }: { healthData: HealthData }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Entropy Analysis
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Total Issues"
          value={healthData.totalIssues}
          accent={healthData.totalIssues > 0 ? 'yellow' : 'green'}
        />
        <KpiCard
          label="Errors"
          value={healthData.errors}
          accent={healthData.errors > 0 ? 'red' : 'default'}
        />
        <KpiCard
          label="Warnings"
          value={healthData.warnings}
          accent={healthData.warnings > 0 ? 'yellow' : 'default'}
        />
        <KpiCard label="Auto-fixable" value={healthData.fixableCount} accent="default" />
      </div>
    </section>
  );
}

function ScanDetailsSection({ healthData }: { healthData: HealthData }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Scan Details
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard label="Suggestions" value={healthData.suggestionCount} />
        <KpiCard label="Scan Duration" value={`${healthData.durationMs} ms`} />
        <KpiCard
          label="Analysis Errors"
          value={healthData.analysisErrors.length}
          accent={healthData.analysisErrors.length > 0 ? 'red' : 'default'}
        />
      </div>
    </section>
  );
}

function AnalysisErrorsSection({ healthData }: { healthData: HealthData }) {
  if (healthData.analysisErrors.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Analysis Errors
      </h2>
      <div className="space-y-2 rounded-lg border border-red-900 bg-gray-900 p-4">
        {healthData.analysisErrors.map((e, i) => (
          <p key={i} className="text-xs text-red-400">
            {e}
          </p>
        ))}
      </div>
    </section>
  );
}

function CheckSection<T>({
  title,
  raw,
  guard,
  Section,
}: {
  title: string;
  raw: unknown;
  guard: (v: unknown) => v is T;
  Section: React.ComponentType<{ data: T }>;
}) {
  if (raw === undefined || raw === null) {
    return (
      <CollapsibleSection title={title}>
        <p className="text-sm text-gray-500">Awaiting first scan...</p>
      </CollapsibleSection>
    );
  }
  if (!guard(raw)) {
    return (
      <CollapsibleSection title={title}>
        <p className="text-sm text-red-400">
          {'error' in (raw as Record<string, unknown>)
            ? String((raw as Record<string, string>).error)
            : 'Unavailable'}
        </p>
      </CollapsibleSection>
    );
  }
  return (
    <CollapsibleSection title={title}>
      <Section data={raw} />
    </CollapsibleSection>
  );
}

function HealthErrorMessage({ health }: { health: Record<string, unknown> }) {
  const msg = 'error' in health ? String(health.error) : 'Unavailable';
  return <p className="text-sm text-red-400">{msg}</p>;
}

function HealthDetails({
  healthData,
  security,
  perf,
  arch,
}: {
  healthData: HealthData;
  security: unknown;
  perf: unknown;
  arch: unknown;
}) {
  return (
    <div className="space-y-8">
      <EntropySection healthData={healthData} />
      <ScanDetailsSection healthData={healthData} />
      <AnalysisErrorsSection healthData={healthData} />
      <CheckSection title="Security" raw={security} guard={isSecurityData} Section={SecuritySection} />
      <CheckSection title="Performance" raw={perf} guard={isPerfData} Section={PerfSection} />
      <CheckSection title="Architecture" raw={arch} guard={isArchData} Section={ArchSection} />
    </div>
  );
}

function resolveHealthData(data: OverviewData | null): {
  health: OverviewData['health'] | null;
  healthData: HealthData | null;
} {
  const health = data ? data.health : null;
  const healthData = health && isHealthData(health) ? health : null;
  return { health, healthData };
}

function resolveChecksData(checksData: ChecksData | null): {
  security: ChecksData['security'] | null;
  perf: ChecksData['perf'] | null;
  arch: ChecksData['arch'] | null;
} {
  return {
    security: checksData ? checksData.security : null,
    perf: checksData ? checksData.perf : null,
    arch: checksData ? checksData.arch : null,
  };
}

export function Health() {
  const { data, lastUpdated, stale, error } = useSSE(SSE_ENDPOINT, 'overview');
  const { data: checksData } = useSSE(SSE_ENDPOINT, 'checks');

  const { health, healthData } = resolveHealthData(data);
  const { security, perf, arch } = resolveChecksData(checksData);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Health</h1>
        <StaleIndicator lastUpdated={lastUpdated} stale={stale} error={error} />
      </div>

      {!data && !error && <p className="text-sm text-gray-500">Connecting to data stream...</p>}

      {health && !healthData && (
        <HealthErrorMessage health={health as unknown as Record<string, unknown>} />
      )}

      {healthData && (
        <HealthDetails healthData={healthData} security={security} perf={perf} arch={arch} />
      )}
    </div>
  );
}
