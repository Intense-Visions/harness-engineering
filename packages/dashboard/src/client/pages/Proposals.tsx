import { useCallback, useEffect, useState } from 'react';
import type {
  SkillProposal,
  ProposalGateFinding,
  ProposalStatus,
} from '@harness-engineering/types';

/**
 * Hermes Phase 4 — `/s/proposals` review queue.
 *
 * Single-column list. Each proposal renders inline content (full YAML+MD for
 * new-skill, diff for refinement). The right column shows the soundness-gate
 * panel with run/approve/reject actions. The reviewer-UX budget (D9 in the
 * spec) is <30s per proposal; nothing about this page is allowed to grow
 * past that target without an explicit follow-up spec.
 */

type StatusFilter = ProposalStatus | 'all';
const STATUS_OPTIONS: StatusFilter[] = [
  'open',
  'gate-running',
  'gate-failed',
  'approved',
  'rejected',
  'all',
];

function StatusBadge({ status }: { status: ProposalStatus }): JSX.Element {
  const colors: Record<ProposalStatus, string> = {
    open: 'bg-blue-500/20 text-blue-200',
    'gate-running': 'bg-yellow-500/20 text-yellow-200',
    'gate-failed': 'bg-red-500/20 text-red-200',
    approved: 'bg-green-500/20 text-green-200',
    rejected: 'bg-neutral-500/20 text-neutral-300',
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[10px] uppercase ${colors[status]}`}>
      {status}
    </span>
  );
}

function FindingRow({ finding }: { finding: ProposalGateFinding }): JSX.Element {
  const color = finding.severity === 'error' ? 'text-red-300' : 'text-yellow-300';
  return (
    <li className="text-xs">
      <span className={`font-semibold ${color}`}>[{finding.severity}]</span>{' '}
      <span className="font-medium">{finding.title}</span>
      <p className="text-neutral-muted">{finding.detail}</p>
    </li>
  );
}

interface ProposalCardProps {
  proposal: SkillProposal;
  onChanged: () => void;
}

function ProposalCard({ proposal, onChanged }: ProposalCardProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(() =>
    proposal.kind === 'new-skill' ? (proposal.content.skillMd ?? '') : (proposal.content.diff ?? '')
  );

  const findings = proposal.gate?.findings ?? [];
  const hasGateRun = !!proposal.gate?.lastRunAt;
  const hasErrors = findings.some((f) => f.severity === 'error');
  const decided = proposal.status === 'approved' || proposal.status === 'rejected';
  const canApprove = hasGateRun && !hasErrors && proposal.status === 'gate-running';

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
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [proposal.id, onChanged]
  );

  const patch = useCallback(
    async (body: object): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/proposals/${proposal.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text}`);
        }
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [proposal.id, onChanged]
  );

  const saveEdit = useCallback((): Promise<void> => {
    const content =
      proposal.kind === 'new-skill' ? { skillMd: editContent } : { diff: editContent };
    return patch({ content });
  }, [proposal.kind, editContent, patch]);

  return (
    <div className="rounded-lg border border-white/10 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">
              {proposal.kind === 'refinement' ? '↻ ' : '＋ '}
              {proposal.content.name}
            </h3>
            <StatusBadge status={proposal.status} />
          </div>
          <p className="mt-0.5 text-xs text-neutral-muted">
            {proposal.kind === 'refinement' && proposal.targetSkill
              ? `Refines ${proposal.targetSkill} — `
              : ''}
            proposed by <span className="font-mono">{proposal.proposedBy}</span> at{' '}
            {new Date(proposal.createdAt).toLocaleString()}
          </p>
        </div>
        <span className="font-mono text-[10px] text-neutral-muted">{proposal.id}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-2 space-y-3">
          <div>
            <h4 className="mb-1 text-xs font-semibold text-neutral-muted">Justification</h4>
            <p className="text-sm">{proposal.source.justification}</p>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-neutral-muted">
                {proposal.kind === 'new-skill' ? 'SKILL.md' : 'Unified diff'}
              </h4>
              {!decided && (
                <button
                  className="rounded bg-white/10 px-2 py-0.5 text-[11px]"
                  onClick={() => setEditing((v) => !v)}
                  type="button"
                >
                  {editing ? 'Cancel' : 'Edit'}
                </button>
              )}
            </div>
            {editing ? (
              <div className="space-y-2">
                <textarea
                  className="block h-48 w-full rounded bg-black/40 p-2 font-mono text-[11px]"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded bg-blue-600 px-3 py-1 text-xs"
                  disabled={busy}
                  onClick={() => void saveEdit().then(() => setEditing(false))}
                >
                  Save (resets gate)
                </button>
              </div>
            ) : (
              <pre className="max-h-64 overflow-y-auto rounded bg-black/40 p-2 font-mono text-[11px] whitespace-pre-wrap">
                {proposal.kind === 'new-skill'
                  ? (proposal.content.skillMd ?? '(no markdown)')
                  : (proposal.content.diff ?? '(no diff)')}
              </pre>
            )}
          </div>
          {proposal.kind === 'new-skill' && (
            <div>
              <h4 className="mb-1 text-xs font-semibold text-neutral-muted">skill.yaml</h4>
              <pre className="max-h-48 overflow-y-auto rounded bg-black/40 p-2 font-mono text-[11px]">
                {proposal.content.skillYaml ?? '(no yaml)'}
              </pre>
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded border border-white/10 p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase text-neutral-muted">
              Soundness gate
            </h4>
            {hasGateRun ? (
              <div className="space-y-2 text-xs">
                <p className="text-neutral-muted">
                  Ran {new Date(proposal.gate!.lastRunAt!).toLocaleString()}
                </p>
                {findings.length === 0 ? (
                  <p className="text-green-300">No findings.</p>
                ) : (
                  <ul className="space-y-2">
                    {findings.map((f, i) => (
                      <FindingRow key={i} finding={f} />
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-xs text-neutral-muted">Not yet run.</p>
            )}
            {!decided && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void post('/run-gate')}
                className="mt-3 w-full rounded bg-blue-600 px-3 py-1 text-xs"
              >
                Run gate
              </button>
            )}
          </div>

          {!decided && (
            <div className="space-y-2">
              <button
                type="button"
                disabled={busy || !canApprove}
                onClick={() => void post('/approve', { decidedBy: 'dashboard-reviewer' })}
                className={`w-full rounded px-3 py-1 text-xs ${
                  canApprove ? 'bg-green-600' : 'bg-green-900/40 text-neutral-muted'
                }`}
                title={canApprove ? '' : 'Run gate with no errors before approving'}
              >
                Approve
              </button>
              <div className="space-y-1">
                <input
                  className="block w-full rounded bg-white/5 px-2 py-1 text-xs"
                  placeholder="Rejection reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy || !rejectReason.trim()}
                  onClick={() => void post('/reject', { reason: rejectReason.trim() })}
                  className={`w-full rounded px-3 py-1 text-xs ${
                    rejectReason.trim() ? 'bg-red-600' : 'bg-red-900/40 text-neutral-muted'
                  }`}
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          {decided && proposal.decision && (
            <div className="rounded border border-white/10 p-3 text-xs">
              <p className="font-semibold capitalize">{proposal.decision.action}</p>
              <p className="text-neutral-muted">
                by {proposal.decision.decidedBy} at{' '}
                {new Date(proposal.decision.decidedAt).toLocaleString()}
              </p>
              {proposal.decision.reason && (
                <p className="mt-1">Reason: {proposal.decision.reason}</p>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-300">{error}</p>}
        </aside>
      </div>
    </div>
  );
}

export function Proposals(): JSX.Element {
  const [proposals, setProposals] = useState<SkillProposal[]>([]);
  const [status, setStatus] = useState<StatusFilter>('open');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/v1/proposals?status=${encodeURIComponent(status)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setProposals((await res.json()) as SkillProposal[]);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Skill proposals</h1>
        <div className="flex items-center gap-2">
          <label htmlFor="proposal-status" className="text-xs text-neutral-muted">
            Status
          </label>
          <select
            id="proposal-status"
            className="rounded bg-white/5 px-2 py-1 text-xs"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded bg-white/10 px-2 py-1 text-xs"
          >
            Refresh
          </button>
        </div>
      </header>

      {fetchError && <p className="text-sm text-red-300">{fetchError}</p>}
      {loading ? (
        <p className="text-sm text-neutral-muted">Loading…</p>
      ) : proposals.length === 0 ? (
        <p className="text-sm text-neutral-muted">No proposals match the current filter.</p>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} onChanged={() => void refresh()} />
          ))}
        </div>
      )}
    </div>
  );
}
