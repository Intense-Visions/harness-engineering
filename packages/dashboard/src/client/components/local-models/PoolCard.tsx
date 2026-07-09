import { useCallback, useRef, useState } from 'react';
import type { DashPoolEntryView, DashPoolStateView } from '../../types/local-models';
import { round1, fmtScore } from './format';

/**
 * Pool card for the LMLM panel. Renders entries, disk used-vs-budget, and
 * `pendingEviction` badges, and carries a **Remove** action per member. Remove
 * POSTs to `POST /api/v1/local-models/pool/remove`, which — like the
 * Recommendations card's approve/reject — is a proposals-backed pool mutation
 * (an auto-approved `evict` proposal), so proposals remain the single
 * pool-mutation mechanism (D-P8-2). An in-use member defers: the backend marks
 * it `pendingEviction` and the row shows "removes after current run".
 *
 * Reuses the container/border classes already in `pages/Proposals.tsx` —
 * introduces no new design tokens.
 */
export interface PoolCardProps {
  pool: DashPoolStateView | null;
  error: string | null;
  loading: boolean;
  /** Called after a successful remove so the page can refetch pool + recommendations. */
  onMutated: () => void;
}

interface PoolMemberRowProps {
  entry: DashPoolEntryView;
  onMutated: () => void;
}

function PoolMemberRow({ entry, onMutated }: PoolMemberRowProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const busyRef = useRef(false);

  const remove = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch('/api/v1/local-models/pool/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ollamaName: entry.ollamaName }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const result = (await res.json().catch(() => ({}))) as { disposition?: string };
      if (result.disposition === 'deferred') setNote('removes after current run');
      onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [entry.ollamaName, onMutated]);

  return (
    <li data-testid={`pool-row-${entry.ollamaName}`} className="rounded border border-white/10 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm">{entry.ollamaName}</span>
        <div className="flex items-center gap-2">
          {entry.pendingEviction && (
            <span
              data-testid={`pool-pending-${entry.ollamaName}`}
              className="rounded bg-yellow-500/20 px-2 py-0.5 text-[10px] uppercase text-yellow-200"
            >
              pending eviction
            </span>
          )}
          <button
            type="button"
            data-testid={`pool-remove-${entry.ollamaName}`}
            disabled={busy || entry.pendingEviction === true}
            onClick={() => void remove()}
            className="rounded bg-red-600 px-3 py-1 text-xs disabled:opacity-50"
          >
            {busy ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
      <div className="mt-0.5 flex items-center justify-between text-xs text-neutral-muted">
        <span className="font-mono">{entry.hfRepoId}</span>
        <span>
          {round1(entry.sizeOnDiskGb)} GB · score {fmtScore(entry.currentScore)}
        </span>
      </div>
      {note && (
        <p data-testid={`pool-note-${entry.ollamaName}`} className="mt-1 text-xs text-yellow-200">
          {note}
        </p>
      )}
      {error && (
        <p data-testid={`pool-error-${entry.ollamaName}`} className="mt-1 text-xs text-red-300">
          {error}
        </p>
      )}
    </li>
  );
}

export function PoolCard({ pool, error, loading, onMutated }: PoolCardProps): JSX.Element {
  const pct =
    pool && pool.diskBudgetGb > 0
      ? Math.min(100, Math.round((pool.diskUsedGb / pool.diskBudgetGb) * 100))
      : 0;

  return (
    <div data-testid="pool-card" className="rounded-lg border border-white/10 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Pool</h2>
        <span className="text-xs text-neutral-muted">
          Install models from the Recommendations card.
        </span>
      </div>

      {pool ? (
        <div className="space-y-3">
          <div data-testid="pool-disk">
            <div className="mb-1 flex items-center justify-between text-xs text-neutral-muted">
              <span>Disk usage</span>
              <span className="font-mono">
                {round1(pool.diskUsedGb)} / {round1(pool.diskBudgetGb)} GB
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
                <PoolMemberRow key={e.ollamaName} entry={e} onMutated={onMutated} />
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
