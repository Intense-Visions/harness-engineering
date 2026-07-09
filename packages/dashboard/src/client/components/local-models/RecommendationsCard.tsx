import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelProposalRecord } from '@harness-engineering/types';
import type { DashRankedModel, DashPoolStateView } from '../../types/local-models';
import type { InstallProgressState } from '../../hooks/useLocalModelsPanel';
import { round1, fmtScore } from './format';

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
/** Human-readable byte count for the download bar (e.g. 12.3 GB, 512 MB). */
function fmtBytes(n: number): string {
  if (n >= 1e9) return `${round1(n / 1e9)} GB`;
  if (n >= 1e6) return `${round1(n / 1e6)} MB`;
  if (n >= 1e3) return `${round1(n / 1e3)} KB`;
  return `${Math.round(n)} B`;
}

export interface RecommendationsCardProps {
  recommendations: DashRankedModel[] | null;
  recommendationsError: string | null;
  proposals: ModelProposalRecord[] | null;
  /** Current pool, used to mark recommendations that are already installed. */
  pool: DashPoolStateView | null;
  /** Called after a successful approve/reject so the page can refetch. */
  onDecided: () => void;
  loading: boolean;
  /** Live install progress/error keyed by `hfRepoId` (from `local-models:install` frames). */
  installProgress?: Record<string, InstallProgressState>;
  /** Clear a settled install error so its row message dismisses. */
  onDismissInstall?: (hfRepoId: string) => void;
}

interface RecommendationRowProps {
  rec: DashRankedModel;
  installed: boolean;
  /** WS-driven download progress / terminal error for this row, if any. */
  progress?: InstallProgressState | undefined;
  /** Clear this row's settled install error (before a retry / on dismiss). */
  onDismiss: () => void;
}

/**
 * A single recommendation row with an Install action. An already-pooled model
 * renders an "installed" badge instead of the button.
 *
 * Install is asynchronous (D3): the POST returns `202` as soon as the pull is
 * accepted server-side, then byte-level progress + the terminal outcome stream in
 * over the `local-models:install` WS topic (the `progress` prop). The row stays in
 * an "Installing…" state — showing a live download bar — from the POST until a
 * terminal frame: `complete` flips it to the "installed" badge (via the pool
 * refetch), `error` re-enables the button and surfaces the failure for a retry.
 */
function RecommendationRow({
  rec,
  installed,
  progress,
  onDismiss,
}: RecommendationRowProps): JSX.Element {
  // `pending` guards the (now fast) POST; `submitted` bridges the gap between a
  // 202 and the first WS frame so the button cannot be re-clicked in between.
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  // A terminal WS error ends the in-flight state so the operator can retry.
  useEffect(() => {
    if (progress?.phase === 'error') setSubmitted(false);
  }, [progress?.phase]);

  const streaming = progress?.phase === 'started' || progress?.phase === 'progress';
  const installing = pending || streaming || (submitted && progress === undefined);
  const errorMsg = progress?.phase === 'error' ? (progress.message ?? 'Install failed') : postError;

  const install = useCallback(async (): Promise<void> => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setPostError(null);
    onDismiss(); // clear any prior WS error for this repo before retrying
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
      // 202 Accepted — the pull runs server-side; do NOT refetch yet. The
      // progress bar and completion arrive over the WS `progress` prop.
      setSubmitted(true);
    } catch (e) {
      setPostError(e instanceof Error ? e.message : String(e));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, [rec.hfRepoId, rec.quant, onDismiss]);

  const pct =
    progress?.totalBytes && progress.totalBytes > 0
      ? Math.min(100, Math.round(((progress.completedBytes ?? 0) / progress.totalBytes) * 100))
      : null;

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
          {rec.quant} · {round1(rec.estimatedVramGb)} GB VRAM · ~{round1(rec.estimatedTokPerSec)}{' '}
          tok/s · {rec.fitsHardware ? 'fits' : "won't fit"}
        </span>
        {installed ? (
          <span data-testid={`rec-installed-${rec.hfRepoId}`} className="text-xs text-green-400">
            installed
          </span>
        ) : (
          <button
            type="button"
            data-testid={`rec-install-${rec.hfRepoId}`}
            disabled={installing}
            onClick={() => void install()}
            className="rounded bg-green-600 px-3 py-1 text-xs disabled:opacity-50"
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        )}
      </div>
      {streaming && (
        <div data-testid={`rec-progress-${rec.hfRepoId}`} className="mt-1.5">
          <div
            className="h-1.5 w-full overflow-hidden rounded bg-white/10"
            role="progressbar"
            {...(pct !== null
              ? { 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }
              : {})}
          >
            <div
              className={`h-full bg-green-500 transition-all ${pct === null ? 'animate-pulse' : ''}`}
              style={{ width: pct !== null ? `${pct}%` : '100%' }}
            />
          </div>
          <p className="mt-0.5 text-xs text-neutral-muted">
            {progress?.message ?? 'Downloading…'}
            {pct !== null && progress?.totalBytes
              ? ` — ${pct}% (${fmtBytes(progress.completedBytes ?? 0)} / ${fmtBytes(progress.totalBytes)})`
              : ''}
          </p>
        </div>
      )}
      {errorMsg && (
        <p data-testid={`rec-error-${rec.hfRepoId}`} className="mt-1 text-xs text-red-300">
          {errorMsg}
        </p>
      )}
    </li>
  );
}

interface ProposalRowProps {
  proposal: ModelProposalRecord;
  onDecided: () => void;
  /** WS-driven install progress / terminal error for this proposal's target. */
  progress?: InstallProgressState | undefined;
  /** Clear this proposal's settled install error (before a retry / on dismiss). */
  onDismiss: () => void;
}

/**
 * A pending model proposal with Approve/Reject. Approving an `add`/`swap`
 * installs the target — a multi-GB `ollama pull` — so, like the direct Install
 * action, the approve route returns `202` and streams the download over the
 * `local-models:install` WS topic (the `progress` prop). The row stays
 * "Installing…" with a live bar until a terminal frame instead of hanging the
 * button until the proxy times out. Reject and `evict` approvals are fast and
 * stay synchronous (they refetch via `onDecided`).
 */
function ProposalRow({ proposal, onDecided, progress, onDismiss }: ProposalRowProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  // Synchronous double-submit guard: `disabled={busy}` only takes effect after
  // a re-render, so a second click in the same frame could otherwise fire a
  // second POST before React flushes. The ref blocks that sub-frame window.
  const busyRef = useRef(false);

  // A terminal WS error ends the in-flight install so the operator can retry.
  useEffect(() => {
    if (progress?.phase === 'error') setSubmitted(false);
  }, [progress?.phase]);

  const streaming = progress?.phase === 'started' || progress?.phase === 'progress';
  const installing = streaming || (submitted && progress === undefined);
  const errorMsg = progress?.phase === 'error' ? (progress.message ?? 'Install failed') : error;

  const approve = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    onDismiss(); // clear any prior WS error for this target before retrying
    try {
      // Approve sends NO body: the route derives decidedBy from the auth token.
      const res = await fetch(`/api/v1/proposals/${proposal.id}/approve`, { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      // 202 = install kicked off in the background (add/swap); keep "Installing…"
      // until a WS terminal frame. 200 = a synchronous approval (evict) → refetch.
      if (res.status === 202) setSubmitted(true);
      else onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [proposal.id, onDecided, onDismiss]);

  const reject = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/proposals/${proposal.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() || 'rejected' }),
      });
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
  }, [proposal.id, rejectReason, onDecided]);

  const { model } = proposal;
  const pct =
    progress?.totalBytes && progress.totalBytes > 0
      ? Math.min(100, Math.round(((progress.completedBytes ?? 0) / progress.totalBytes) * 100))
      : null;
  const disabled = busy || installing;

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
          data-testid={`proposal-approve-${proposal.id}`}
          disabled={disabled}
          onClick={() => void approve()}
          className="rounded bg-green-600 px-3 py-1 text-xs disabled:opacity-50"
        >
          {installing ? 'Installing…' : busy ? 'Approving…' : 'Approve'}
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
          disabled={disabled}
          onClick={() => void reject()}
          className="rounded bg-red-600 px-3 py-1 text-xs disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {streaming && (
        <div data-testid={`proposal-progress-${proposal.id}`} className="mt-2">
          <div
            className="h-1.5 w-full overflow-hidden rounded bg-white/10"
            role="progressbar"
            {...(pct !== null
              ? { 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }
              : {})}
          >
            <div
              className={`h-full bg-green-500 transition-all ${pct === null ? 'animate-pulse' : ''}`}
              style={{ width: pct !== null ? `${pct}%` : '100%' }}
            />
          </div>
          <p className="mt-0.5 text-xs text-neutral-muted">
            {progress?.message ?? 'Downloading…'}
            {pct !== null && progress?.totalBytes
              ? ` — ${pct}% (${fmtBytes(progress.completedBytes ?? 0)} / ${fmtBytes(progress.totalBytes)})`
              : ''}
          </p>
        </div>
      )}
      {errorMsg && (
        <p data-testid={`proposal-error-${proposal.id}`} className="mt-1 text-xs text-red-300">
          {errorMsg}
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
  installProgress,
  onDismissInstall,
}: RecommendationsCardProps): JSX.Element {
  const recs = recommendations ?? [];
  const props = proposals ?? [];
  const showEmptyRecs = recs.length === 0;
  // Guard on Array.isArray, not `?? []`: a malformed pool payload (e.g. `[]`)
  // would make `pool.entries` resolve to `Array.prototype.entries` (a function),
  // which `?? []` would not catch.
  const poolEntries = pool && Array.isArray(pool.entries) ? pool.entries : [];
  const installedRepos = new Set(poolEntries.map((e) => e.hfRepoId));

  // Manual "Refresh" triggers a force-refresh tick (re-fetch HF + re-rank +
  // reconcile), then refetches so new recommendations/proposals render. Unlike
  // install, this is a fast synchronous recompute — no `ollama pull`, no 202.
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refreshingRef = useRef(false);
  const lmlmDisabled = recommendationsError === 'LMLM disabled';

  const refresh = useCallback(async (): Promise<void> => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch('/api/v1/local-models/refresh', { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      onDecided();
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : String(e));
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [onDecided]);

  return (
    <div data-testid="rec-card" className="rounded-lg border border-white/10 p-4">
      <h2 className="mb-3 text-base font-semibold">Recommendations</h2>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase text-neutral-muted">
            Recommended for your hardware
          </h3>
          {!lmlmDisabled && (
            <button
              type="button"
              data-testid="rec-refresh"
              disabled={refreshing}
              onClick={() => void refresh()}
              className="rounded border border-white/10 px-2 py-0.5 text-xs text-neutral-muted hover:bg-white/5 disabled:opacity-50"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
        </div>
        {refreshError && (
          <p data-testid="rec-refresh-error" className="mb-2 text-xs text-red-300">
            {refreshError}
          </p>
        )}
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
                progress={installProgress?.[r.hfRepoId]}
                onDismiss={() => onDismissInstall?.(r.hfRepoId)}
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
              <ProposalRow
                key={p.id}
                proposal={p}
                onDecided={onDecided}
                progress={installProgress?.[p.model.target.hfRepoId]}
                onDismiss={() => onDismissInstall?.(p.model.target.hfRepoId)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
