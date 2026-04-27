import { useState, useEffect, useCallback } from 'react';
import { KpiCard } from '../components/KpiCard';

// --- Inline types matching the server gather shape ---

interface TraceabilityTotals {
  total: number;
  withCode: number;
  withTests: number;
  fullyTraced: number;
  untraceable: number;
}

interface TraceabilityRequirement {
  requirementId: string;
  requirementName: string;
  specPath: string;
  featureName: string;
  status: 'full' | 'code-only' | 'test-only' | 'none';
  codeFileCount: number;
  testFileCount: number;
}

interface TraceabilitySnapshot {
  overallCoverage: number;
  totals: TraceabilityTotals;
  specs: {
    specPath: string;
    featureName: string;
    total: number;
    withCode: number;
    withTests: number;
    fullyTraced: number;
    untraceable: number;
    coveragePercent: number;
  }[];
  requirements: TraceabilityRequirement[];
  generatedAt: string;
}

// --- Helpers ---

type CoverageStatus = TraceabilityRequirement['status'];

function statusLabel(status: CoverageStatus): string {
  switch (status) {
    case 'full':
      return 'Covered';
    case 'code-only':
      return 'Partial (code)';
    case 'test-only':
      return 'Partial (test)';
    case 'none':
      return 'Uncovered';
  }
}

function statusColorClass(status: CoverageStatus): string {
  switch (status) {
    case 'full':
      return 'text-emerald-400';
    case 'code-only':
    case 'test-only':
      return 'text-yellow-400';
    case 'none':
      return 'text-red-400';
  }
}

function statusDotClass(status: CoverageStatus): string {
  switch (status) {
    case 'full':
      return 'bg-emerald-400';
    case 'code-only':
    case 'test-only':
      return 'bg-yellow-400';
    case 'none':
      return 'bg-red-400';
  }
}

function coverageAccent(pct: number): 'green' | 'yellow' | 'red' {
  if (pct >= 80) return 'green';
  if (pct >= 50) return 'yellow';
  return 'red';
}

// --- Sub-components ---

function RequirementRow({ req }: { req: TraceabilityRequirement }) {
  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/40">
      <td className="py-2 px-3">
        <div className="font-mono text-xs text-gray-200">
          {req.requirementName || req.requirementId}
        </div>
        {req.featureName && (
          <div className="text-[10px] text-gray-500 mt-0.5">{req.featureName}</div>
        )}
      </td>
      <td className="py-2 px-3">
        <span className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusDotClass(req.status)}`} />
          <span className={`text-xs font-medium ${statusColorClass(req.status)}`}>
            {statusLabel(req.status)}
          </span>
        </span>
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-gray-200 text-sm">
        {req.codeFileCount}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-gray-200 text-sm">
        {req.testFileCount}
      </td>
    </tr>
  );
}

function RequirementsTable({ requirements }: { requirements: TraceabilityRequirement[] }) {
  if (requirements.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center">
        <p className="text-sm text-gray-500">
          No requirements found. Ingest specs with RequirementIngestor first.
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
              Requirement
            </th>
            <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
              Status
            </th>
            <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
              Implementations
            </th>
            <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
              Tests
            </th>
          </tr>
        </thead>
        <tbody>
          {requirements.map((req) => (
            <RequirementRow key={req.requirementId} req={req} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Data fetching ---

async function fetchTraceability(): Promise<TraceabilitySnapshot | null> {
  const res = await fetch('/api/traceability');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data: TraceabilitySnapshot | null };
  return body.data;
}

// --- Page ---

export function Traceability() {
  const [snapshot, setSnapshot] = useState<TraceabilitySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchTraceability();
      if (data === null) {
        setEmpty(true);
      } else {
        setSnapshot(data);
      }
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

  const coveredCount = snapshot ? snapshot.totals.fullyTraced : 0;
  const partialCount = snapshot
    ? snapshot.totals.withCode + snapshot.totals.withTests - 2 * snapshot.totals.fullyTraced
    : 0;
  // partial = (withCode - fullyTraced) + (withTests - fullyTraced)
  // which simplifies to withCode + withTests - 2*fullyTraced
  // but we need to clamp since code-only and test-only don't overlap with fullyTraced
  const uncoveredCount = snapshot ? snapshot.totals.untraceable : 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Traceability</h1>
        {snapshot && (
          <span className="text-xs text-gray-500">
            Generated {new Date(snapshot.generatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {loading && !snapshot && (
        <p className="text-sm text-gray-500">Loading traceability data...</p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {empty && !loading && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-sm text-gray-400">
            No traceability data available. Run{' '}
            <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs font-mono text-gray-300">
              harness graph scan
            </code>{' '}
            and ingest specs with RequirementIngestor first.
          </p>
        </div>
      )}

      {snapshot && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Coverage Summary
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard label="Total Requirements" value={snapshot.totals.total} />
              <KpiCard
                label="Covered"
                value={coveredCount}
                accent="green"
                sub={`${snapshot.overallCoverage}% coverage`}
              />
              <KpiCard
                label="Partial"
                value={
                  partialCount > 0
                    ? partialCount
                    : snapshot.totals.total - coveredCount - uncoveredCount
                }
                accent="yellow"
              />
              <KpiCard
                label="Uncovered"
                value={uncoveredCount}
                accent={uncoveredCount > 0 ? 'red' : 'green'}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Overall Coverage
            </h2>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Fully traced</span>
                <span
                  className={`text-sm font-bold ${coverageAccent(snapshot.overallCoverage) === 'green' ? 'text-emerald-400' : coverageAccent(snapshot.overallCoverage) === 'yellow' ? 'text-yellow-400' : 'text-red-400'}`}
                >
                  {snapshot.overallCoverage}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    coverageAccent(snapshot.overallCoverage) === 'green'
                      ? 'bg-emerald-500'
                      : coverageAccent(snapshot.overallCoverage) === 'yellow'
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${snapshot.overallCoverage}%` }}
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Requirements
            </h2>
            <RequirementsTable requirements={snapshot.requirements} />
          </section>
        </div>
      )}
    </div>
  );
}
