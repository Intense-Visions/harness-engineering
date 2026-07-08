import { useCallback, useState } from 'react';
import type { ModelProposalRecord } from '@harness-engineering/types';
import type { DashRankedModel } from '../../types/local-models';

/**
 * Recommendations card for the LMLM panel. Two sections:
 *
 *  1. "Recommended for your hardware" — the ranked list from
 *     `GET /api/v1/local-models/recommendations`. Empty until the Phase 2
 *     candidate parser lands, so `[]` (or an LMLM-disabled error) renders a
 *     first-class "No recommendations yet" empty state (Truth 3 / O3), never a
 *     blank region or error.
 *  2. "Pending proposals" — open model proposals with Approve/Reject. Approve
 *     for a `kind:'model'` proposal requires only the terminal-state guard (no
 *     prior soundness-gate run, unlike skill proposals — proposals.ts:163), so
 *     the buttons are enabled immediately for open proposals.
 *
 * Approve/Reject POST to the SHARED `POST /api/v1/proposals/:id/{approve,reject}`
 * route (D-P8-2 — the only pool-mutation path on the dashboard). On success the
 * card calls `onDecided` so the page can refetch pool + recommendations.
 *
 * Reuses the container/border/button classes from `pages/Proposals.tsx` —
 * introduces no new design tokens.
 */
export interface RecommendationsCardProps {
  recommendations: DashRankedModel[] | null;
  recommendationsError: string | null;
  proposals: ModelProposalRecord[] | null;
  /** Called after a successful approve/reject so the page can refetch. */
  onDecided: () => void;
  loading: boolean;
}

interface ProposalRowProps {
  proposal: ModelProposalRecord;
  onDecided: () => void;
}

function ProposalRow({ proposal, onDecided }: ProposalRowProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const post = useCallback(
    async (suffix: string, body?: object): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        const init: RequestInit = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        };
        if (body) init.body = JSON.stringify(body);
        const res = await fetch(`/api/v1/proposals/${proposal.id}${suffix}`, init);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text}`);
        }
        onDecided();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [proposal.id, onDecided]
  );

  const { model } = proposal;

  return (
    <li data-testid={`proposal-${proposal.id}`} className="rounded border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm">
          <span className="uppercase text-neutral-muted">{model.action}</span>{' '}
          {model.target.ollamaName}
        </span>
        <span className="text-xs text-neutral-muted">
          Δ{model.scoreDelta} · {model.diskImpactGb} GB
        </span>
      </div>
      <p className="mt-1 text-sm">{model.justification.summary}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void post('/approve', { decidedBy: 'dashboard-reviewer' })}
          className="rounded bg-green-600 px-3 py-1 text-xs"
        >
          Approve
        </button>
        <input
          data-testid={`reject-reason-${proposal.id}`}
          className="flex-1 rounded bg-white/5 px-2 py-1 text-xs"
          placeholder="Rejection reason"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void post('/reject', { reason: rejectReason.trim() || 'rejected' })}
          className="rounded bg-red-600 px-3 py-1 text-xs"
        >
          Reject
        </button>
      </div>
      {error && (
        <p data-testid={`proposal-error-${proposal.id}`} className="mt-1 text-xs text-red-300">
          {error}
        </p>
      )}
    </li>
  );
}

export function RecommendationsCard({
  recommendations,
  recommendationsError,
  proposals,
  onDecided,
  loading,
}: RecommendationsCardProps): JSX.Element {
  const recs = recommendations ?? [];
  const props = proposals ?? [];
  const showEmptyRecs = recs.length === 0;

  return (
    <div data-testid="rec-card" className="rounded-lg border border-white/10 p-4">
      <h2 className="mb-3 text-base font-semibold">Recommendations</h2>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase text-neutral-muted">
          Recommended for your hardware
        </h3>
        {loading && showEmptyRecs && !recommendationsError ? (
          <p className="text-sm text-neutral-muted">Loading recommendations…</p>
        ) : showEmptyRecs ? (
          <p data-testid="rec-empty" className="text-sm text-neutral-muted">
            No recommendations yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {recs.map((r) => (
              <li
                key={r.hfRepoId}
                data-testid={`rec-row-${r.hfRepoId}`}
                className="rounded border border-white/10 p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm">{r.hfRepoId}</span>
                  <span className="text-xs text-neutral-muted">
                    score {r.score} · {r.evidence}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-neutral-muted">
                  {r.estimatedVramGb} GB VRAM · ~{r.estimatedTokPerSec} tok/s ·{' '}
                  {r.fitsHardware ? 'fits' : "won't fit"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {props.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase text-neutral-muted">
            Pending proposals
          </h3>
          <ul className="space-y-2">
            {props.map((p) => (
              <ProposalRow key={p.id} proposal={p} onDecided={onDecided} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
