import { useCallback, useRef, useState } from 'react';
import type { ModelProposalRecord } from '@harness-engineering/types';
import type { DashRankedModel, DashPoolStateView } from '../../types/local-models';

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
 * Each recommendation row also carries an **Install** button (an already-pooled
 * model shows "installed" instead). Install POSTs to
 * `POST /api/v1/local-models/pool/install`, which — like approve/reject — is a
 * proposals-backed pool mutation (an auto-approved proposal), so proposals
 * remain the single pool-mutation mechanism (D-P8-2). On success the card calls
 * `onDecided` so the page refetches pool + recommendations.
 *
 * Reuses the container/border/button classes from `pages/Proposals.tsx` —
 * introduces no new design tokens.
 */
/** Round to at most one decimal, dropping a trailing `.0` (e.g. 44.159 → "44.2", 20 → "20"). */
function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/** Ranking scores render as whole numbers (they are a 0–100 index, not a measurement). */
function fmtScore(n: number): string {
  return Math.round(n).toString();
}

export interface RecommendationsCardProps {
  recommendations: DashRankedModel[] | null;
  recommendationsError: string | null;
  proposals: ModelProposalRecord[] | null;
  /** Current pool, used to mark recommendations that are already installed. */
  pool: DashPoolStateView | null;
  /** Called after a successful approve/reject/install so the page can refetch. */
  onDecided: () => void;
  loading: boolean;
}

interface RecommendationRowProps {
  rec: DashRankedModel;
  installed: boolean;
  onInstalled: () => void;
}

/**
 * A single recommendation row with an Install action. An already-pooled model
 * renders an "installed" badge instead of the button. Mirrors `ProposalRow`'s
 * synchronous double-submit guard; install awaits the backend (which awaits the
 * `ollama pull`) so the button shows an indeterminate "Installing…" state until
 * the pool refetches.
 */
function RecommendationRow({ rec, installed, onInstalled }: RecommendationRowProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const install = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/local-models/pool/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hfRepoId: rec.hfRepoId, quant: rec.quant }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      onInstalled();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [rec.hfRepoId, rec.quant, onInstalled]);

  return (
    <li data-testid={`rec-row-${rec.hfRepoId}`} className="rounded border border-white/10 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm">{rec.hfRepoId}</span>
        <span className="text-xs text-neutral-muted">
          score {fmtScore(rec.score)} · {rec.evidence}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="text-xs text-neutral-muted">
          {round1(rec.estimatedVramGb)} GB VRAM · ~{round1(rec.estimatedTokPerSec)} tok/s ·{' '}
          {rec.fitsHardware ? 'fits' : "won't fit"}
        </span>
        {installed ? (
          <span data-testid={`rec-installed-${rec.hfRepoId}`} className="text-xs text-green-400">
            installed
          </span>
        ) : (
          <button
            type="button"
            data-testid={`rec-install-${rec.hfRepoId}`}
            disabled={busy}
            onClick={() => void install()}
            className="rounded bg-green-600 px-3 py-1 text-xs disabled:opacity-50"
          >
            {busy ? 'Installing…' : 'Install'}
          </button>
        )}
      </div>
      {error && (
        <p data-testid={`rec-error-${rec.hfRepoId}`} className="mt-1 text-xs text-red-300">
          {error}
        </p>
      )}
    </li>
  );
}

interface ProposalRowProps {
  proposal: ModelProposalRecord;
  onDecided: () => void;
}

function ProposalRow({ proposal, onDecided }: ProposalRowProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  // Synchronous double-submit guard: `disabled={busy}` only takes effect after
  // a re-render, so a second click in the same frame could otherwise fire a
  // second POST before React flushes. The ref blocks that sub-frame window.
  const busyRef = useRef(false);

  const post = useCallback(
    async (suffix: string, body?: object): Promise<void> => {
      if (busyRef.current) return;
      busyRef.current = true;
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
        busyRef.current = false;
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
          Δ{round1(model.scoreDelta)} · {round1(model.diskImpactGb)} GB
        </span>
      </div>
      <p className="mt-1 text-sm">{model.justification.summary}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          // Approve sends NO body: the proposals route derives decidedBy from the
          // auth token via getDecidedBy and never reads a body field, so a
          // { decidedBy } payload was dead. Symmetric with reject, which sends
          // only the { reason } the route actually consumes (XP-4).
          onClick={() => void post('/approve')}
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
  pool,
  onDecided,
  loading,
}: RecommendationsCardProps): JSX.Element {
  const recs = recommendations ?? [];
  const props = proposals ?? [];
  const showEmptyRecs = recs.length === 0;
  // Guard on Array.isArray, not `?? []`: a malformed pool payload (e.g. `[]`)
  // would make `pool.entries` resolve to `Array.prototype.entries` (a function),
  // which `?? []` would not catch.
  const poolEntries = pool && Array.isArray(pool.entries) ? pool.entries : [];
  const installedRepos = new Set(poolEntries.map((e) => e.hfRepoId));

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
              <RecommendationRow
                key={r.hfRepoId}
                rec={r}
                installed={installedRepos.has(r.hfRepoId)}
                onInstalled={onDecided}
              />
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
