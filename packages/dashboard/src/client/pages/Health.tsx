import { useState, useEffect, useCallback } from 'react';
import { useSSE } from '../hooks/useSSE';
import { KpiCard } from '../components/KpiCard';
import { StaleIndicator } from '../components/StaleIndicator';
import { ActionButton } from '../components/ActionButton';
import { SSE_ENDPOINT } from '@shared/constants';
import { isHealthData, isSecurityData, isPerfData, isArchData } from '../utils/typeGuards';
import type {
  HealthData,
  SecurityData,
  PerfData,
  ArchData,
  OverviewData,
  ChecksData,
  CIData,
  CheckResult,
} from '@shared/types';

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
      <CheckSection
        title="Security"
        raw={security}
        guard={isSecurityData}
        Section={SecuritySection}
      />
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

// --- CI section ---

const CHECK_NAMES = [
  'validate',
  'check-deps',
  'check-arch',
  'check-perf',
  'check-security',
  'check-docs',
  'phase-gate',
] as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function CheckBadge({
  name,
  result,
  expanded,
  onToggle,
}: {
  name: string;
  result: CheckResult | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!result) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-gray-600" />
          <span className="text-sm font-medium text-gray-400">{name}</span>
        </div>
        <p className="mt-1 text-xs text-gray-600">Not yet run</p>
      </div>
    );
  }

  const bgColor = result.passed ? 'border-emerald-800' : 'border-red-800';
  const dotColor = result.passed ? 'bg-emerald-400' : 'bg-red-400';
  const textColor = result.passed ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className={`rounded-lg border ${bgColor} bg-gray-900`}>
      <button onClick={onToggle} className="w-full p-4 text-left" aria-expanded={expanded}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-full ${dotColor}`} />
            <span className="text-sm font-medium text-gray-200">{name}</span>
          </div>
          <span className={`text-xs font-medium ${textColor}`}>
            {result.passed ? 'PASS' : 'FAIL'}
          </span>
        </div>
        {!expanded && (result.errorCount > 0 || result.warningCount > 0) && (
          <p className="mt-1 text-xs text-gray-500">
            {result.errorCount > 0 && `${result.errorCount} errors`}
            {result.errorCount > 0 && result.warningCount > 0 && ', '}
            {result.warningCount > 0 && `${result.warningCount} warnings`}
          </p>
        )}
      </button>
      {expanded && (
        <div className="border-t border-gray-800 px-4 py-3">
          <div className="space-y-1 text-xs">
            <p className="text-gray-400">
              Errors:{' '}
              <span className={result.errorCount > 0 ? 'text-red-400' : 'text-gray-300'}>
                {result.errorCount}
              </span>
              {' | '}
              Warnings:{' '}
              <span className={result.warningCount > 0 ? 'text-yellow-400' : 'text-gray-300'}>
                {result.warningCount}
              </span>
            </p>
            {result.details && <p className="text-gray-500">{result.details}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function buildCheckMap(ciData: CIData | null): Map<string, CheckResult> {
  const map = new Map<string, CheckResult>();
  if (!ciData) return map;
  for (const check of ciData.checks) {
    map.set(check.name, check);
  }
  return map;
}

async function fetchCIData(
  setCIData: (d: CIData) => void,
  setError: (e: string | null) => void,
  setLoading: (v: boolean) => void
): Promise<void> {
  try {
    const res = await fetch('/api/ci');
    if (!res.ok) {
      setError(`HTTP ${res.status}`);
      return;
    }
    const body = (await res.json()) as { data: CIData };
    setCIData(body.data);
    setError(null);
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Network error');
  } finally {
    setLoading(false);
  }
}

function CISection() {
  const [ciData, setCIData] = useState<CIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ciError, setCIError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    void fetchCIData(setCIData, setCIError, setLoading);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleExpanded = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const checkMap = buildCheckMap(ciData);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">CI Checks</h2>
        <div className="flex items-center gap-4">
          <ActionButton
            url="/api/actions/refresh-checks"
            label="Run All Checks"
            loadingLabel="Running checks..."
            onSuccess={refresh}
          />
          {ciData?.lastRun && (
            <span className="text-xs text-gray-500">Last checked {timeAgo(ciData.lastRun)}</span>
          )}
        </div>
      </div>

      {loading && !ciData && <p className="text-sm text-gray-500">Loading check results...</p>}
      {ciError && <p className="text-sm text-red-400">{ciError}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {CHECK_NAMES.map((name) => (
          <CheckBadge
            key={name}
            name={name}
            result={checkMap.get(name)}
            expanded={expanded.has(name)}
            onToggle={() => toggleExpanded(name)}
          />
        ))}
      </div>
    </section>
  );
}

// --- Main page ---

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

      <div className="space-y-8">
        <CISection />

        {!data && !error && <p className="text-sm text-gray-500">Connecting to data stream...</p>}

        {health && !healthData && (
          <HealthErrorMessage health={health as unknown as Record<string, unknown>} />
        )}

        {healthData && (
          <HealthDetails healthData={healthData} security={security} perf={perf} arch={arch} />
        )}
      </div>
    </div>
  );
}
