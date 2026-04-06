import { useSSE } from '../hooks/useSSE';
import { KpiCard } from '../components/KpiCard';
import { StaleIndicator } from '../components/StaleIndicator';
import { SSE_ENDPOINT } from '@shared/constants';
import { isHealthData } from '../utils/typeGuards';

export function Health() {
  const { data, lastUpdated, stale, error } = useSSE(SSE_ENDPOINT, 'overview');

  const health = data ? data.health : null;
  const healthData = health && isHealthData(health) ? health : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Health</h1>
        <StaleIndicator lastUpdated={lastUpdated} stale={stale} error={error} />
      </div>

      {!data && !error && <p className="text-sm text-gray-500">Connecting to data stream…</p>}

      {health && !healthData && (
        <p className="text-sm text-red-400">{'error' in health ? health.error : 'Unavailable'}</p>
      )}

      {healthData && (
        <div className="space-y-8">
          {/* Issue counts */}
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

          {/* Scan metadata */}
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

          {/* Analysis errors */}
          {healthData.analysisErrors.length > 0 && (
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
          )}
        </div>
      )}
    </div>
  );
}
