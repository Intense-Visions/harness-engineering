import type { DashPoolStateView } from '../../types/local-models';

/**
 * Pool card for the LMLM panel. READ-ONLY (D-P8-2): renders entries, disk
 * used-vs-budget, and `pendingEviction` badges. Exposes NO install/evict
 * controls — no HTTP install/evict route exists (Phase 7 D-Q2); pool mutation
 * flows through the Recommendations card's proposal approve/reject path.
 *
 * Presentational, props-only. Reuses the container/border classes already in
 * `pages/Proposals.tsx` — introduces no new design tokens.
 */
export interface PoolCardProps {
  pool: DashPoolStateView | null;
  error: string | null;
  loading: boolean;
}

export function PoolCard({ pool, error, loading }: PoolCardProps): JSX.Element {
  const pct =
    pool && pool.diskBudgetGb > 0
      ? Math.min(100, Math.round((pool.diskUsedGb / pool.diskBudgetGb) * 100))
      : 0;

  return (
    <div data-testid="pool-card" className="rounded-lg border border-white/10 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Pool</h2>
        <span className="text-xs text-neutral-muted">
          Pool changes are approved on the Recommendations card.
        </span>
      </div>

      {pool ? (
        <div className="space-y-3">
          <div data-testid="pool-disk">
            <div className="mb-1 flex items-center justify-between text-xs text-neutral-muted">
              <span>Disk usage</span>
              <span className="font-mono">
                {pool.diskUsedGb} / {pool.diskBudgetGb} GB
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-white/10">
              <div className="h-full bg-blue-500/60" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {pool.entries.length === 0 ? (
            <p className="text-sm text-neutral-muted">No models in the pool.</p>
          ) : (
            <ul className="space-y-2">
              {pool.entries.map((e) => (
                <li
                  key={e.ollamaName}
                  data-testid={`pool-row-${e.ollamaName}`}
                  className="rounded border border-white/10 p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm">{e.ollamaName}</span>
                    {e.pendingEviction && (
                      <span
                        data-testid={`pool-pending-${e.ollamaName}`}
                        className="rounded bg-yellow-500/20 px-2 py-0.5 text-[10px] uppercase text-yellow-200"
                      >
                        pending eviction
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-xs text-neutral-muted">
                    <span className="font-mono">{e.hfRepoId}</span>
                    <span>
                      {e.sizeOnDiskGb} GB · score {e.currentScore}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : error === 'LMLM disabled' ? (
        <p className="text-sm text-neutral-muted">Pool unavailable — LMLM disabled.</p>
      ) : error ? (
        <p className="text-sm text-neutral-muted">Pool unavailable — {error}.</p>
      ) : loading ? (
        <p className="text-sm text-neutral-muted">Loading pool…</p>
      ) : (
        <p className="text-sm text-neutral-muted">No models in the pool.</p>
      )}
    </div>
  );
}
