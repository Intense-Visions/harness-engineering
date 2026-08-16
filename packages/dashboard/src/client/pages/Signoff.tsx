import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * UAT Sign-off — the dashboard front door (#710) to the existing sign-off record
 * primitive. A non-engineer reviews the acceptance basis for a shipped change
 * (its proposal Success Criteria), rules each item and an overall verdict, types
 * their signer identity, and records the decision through the same
 * `UatSignoffRecorder` the CLI skill uses.
 *
 * Human is the sole authority: nothing is pre-selected, the submit control is
 * gated on a complete human decision, and the record blocks nothing (advisory).
 */

// --- Types mirroring the server SignoffBasis / SignoffRecord shapes ---

type Disposition = 'ACCEPT' | 'REJECT' | 'CHANGES_REQUESTED';
type Decision = 'ACCEPTED' | 'REJECTED' | 'CHANGES_REQUESTED';
type BasisSection = 'Success Criteria' | 'User-Visible Behavior' | 'Overview';

interface BasisItem {
  id: string;
  text: string;
}

interface ExistingSignoff {
  slug: string;
  decision: Decision;
  signedOffBy: string;
  signedAt: string;
  items: { id: string; disposition: Disposition; note?: string }[];
  signoffPath: string;
}

interface SignoffBasis {
  slug: string;
  items: BasisItem[];
  basisSection: BasisSection | null;
  existing?: ExistingSignoff;
}

interface SignoffConfirmation {
  recorded: true;
  outcomeId: string;
  result: 'success' | 'failure';
  signoffPath: string;
}

const DISPOSITIONS: Disposition[] = ['ACCEPT', 'CHANGES_REQUESTED', 'REJECT'];
const DECISIONS: Decision[] = ['ACCEPTED', 'CHANGES_REQUESTED', 'REJECTED'];

// --- Data fetching ---

function slugFromLocation(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('slug') ?? '';
}

async function fetchBasis(slug: string): Promise<SignoffBasis> {
  const res = await fetch(`/api/signoff/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data: SignoffBasis };
  return body.data;
}

async function postSignoff(payload: {
  slug: string;
  decision: Decision;
  signedOffBy: string;
  items: { id: string; disposition: Disposition; note?: string }[];
  criteriaRefs: string[];
}): Promise<SignoffConfirmation> {
  const res = await fetch('/api/signoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as SignoffConfirmation | { error: string };
  if (!res.ok || 'error' in body) {
    throw new Error('error' in body ? body.error : `HTTP ${res.status}`);
  }
  return body;
}

// --- Sub-components ---

function DispositionControl({
  itemId,
  value,
  onChange,
}: {
  itemId: string;
  value: Disposition | null;
  onChange: (d: Disposition) => void;
}) {
  return (
    <div className="flex gap-2" role="group" aria-label={`Disposition for ${itemId}`}>
      {DISPOSITIONS.map((d) => (
        <button
          key={d}
          type="button"
          data-testid={`disp-${itemId}-${d}`}
          aria-pressed={value === d}
          onClick={() => onChange(d)}
          className={`rounded px-2 py-1 text-xs font-medium border ${
            value === d
              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
              : 'border-gray-700 text-gray-400 hover:border-gray-500'
          }`}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

function ExistingSignoffView({
  existing,
  onNew,
}: {
  existing: ExistingSignoff;
  onNew: () => void;
}) {
  return (
    <div data-testid="signoff-existing" className="space-y-4">
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Recorded sign-off
        </h2>
        <p className="text-sm text-gray-200">
          <span className="font-semibold">{existing.decision}</span> — signed off by{' '}
          {existing.signedOffBy}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {new Date(existing.signedAt).toLocaleString()} · {existing.signoffPath}
        </p>
        <ul className="mt-3 space-y-1">
          {existing.items.map((i) => (
            <li key={i.id} className="text-xs text-gray-300">
              <span className="font-mono text-gray-400">{i.id}</span> — {i.disposition}
              {i.note ? ` · ${i.note}` : ''}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        data-testid="signoff-record-new"
        onClick={onNew}
        className="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:border-gray-400"
      >
        Record a new sign-off
      </button>
    </div>
  );
}

function ConfirmationView({ confirmation }: { confirmation: SignoffConfirmation }) {
  return (
    <div
      data-testid="signoff-confirmation"
      className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-5"
    >
      <h2 className="mb-2 text-sm font-semibold text-emerald-300">Sign-off recorded</h2>
      <p className="text-xs text-gray-300">
        Advisory / record-only — nothing was blocked. Recorded node{' '}
        <span className="font-mono">{confirmation.outcomeId}</span> (result: {confirmation.result}).
      </p>
      <p className="mt-1 text-xs text-gray-500">Wrote {confirmation.signoffPath}</p>
    </div>
  );
}

// --- Page ---

export function Signoff() {
  const [slug] = useState<string>(slugFromLocation);
  const [basis, setBasis] = useState<SignoffBasis | null>(null);
  const [loading, setLoading] = useState<boolean>(slug.length > 0);
  const [error, setError] = useState<string | null>(null);

  const [dispositions, setDispositions] = useState<Record<string, Disposition>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [decision, setDecision] = useState<Decision | null>(null);
  const [signedOffBy, setSignedOffBy] = useState<string>('');
  const [recordNew, setRecordNew] = useState<boolean>(false);
  const [confirmation, setConfirmation] = useState<SignoffConfirmation | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const load = useCallback(async () => {
    if (slug.length === 0) return;
    setLoading(true);
    try {
      const data = await fetchBasis(slug);
      setBasis(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = basis?.items ?? [];

  // Submit is gated on a COMPLETE human decision: every item ruled, an overall
  // verdict chosen, and a non-empty signer typed. The surface pre-selects nothing.
  const allRuled = items.length > 0 && items.every((i) => dispositions[i.id] !== undefined);
  const canSubmit = useMemo(
    () => allRuled && decision !== null && signedOffBy.trim().length > 0 && !submitting,
    [allRuled, decision, signedOffBy, submitting]
  );

  const submit = useCallback(async () => {
    if (!canSubmit || decision === null) return;
    setSubmitting(true);
    try {
      const payloadItems = items.map((i) => {
        const note = notes[i.id]?.trim();
        return {
          id: i.id,
          disposition: dispositions[i.id]!,
          ...(note ? { note } : {}),
        };
      });
      const conf = await postSignoff({
        slug,
        decision,
        signedOffBy: signedOffBy.trim(),
        items: payloadItems,
        criteriaRefs: payloadItems.filter((i) => i.disposition === 'ACCEPT').map((i) => i.id),
      });
      setConfirmation(conf);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record sign-off');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, decision, items, notes, dispositions, slug, signedOffBy]);

  return (
    <div data-testid="signoff-page">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Sign-off</h1>
        <p className="mt-1 text-sm text-gray-500">
          Human acceptance of a shipped change against its Success Criteria. Advisory and
          record-only — it blocks nothing.
        </p>
      </div>

      {slug.length === 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400">
          Add a <code className="rounded bg-gray-800 px-1 py-0.5 font-mono text-xs">?slug=</code>{' '}
          query param (e.g. <code className="font-mono text-xs">/s/signoff?slug=my-change</code>) to
          load a change&apos;s acceptance basis.
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Loading acceptance basis…</p>}
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {basis && !loading && (
        <div className="space-y-6">
          {confirmation ? (
            <ConfirmationView confirmation={confirmation} />
          ) : basis.existing && !recordNew ? (
            <ExistingSignoffView existing={basis.existing} onNew={() => setRecordNew(true)} />
          ) : (
            <>
              <p className="text-xs text-gray-500">
                Basis:{' '}
                {basis.basisSection ? (
                  <span className="text-gray-300">{basis.basisSection}</span>
                ) : (
                  <span className="text-yellow-400">no acceptance basis on disk</span>
                )}
              </p>

              {items.length === 0 ? (
                <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400">
                  No acceptance items found for <span className="font-mono">{slug}</span>.
                </div>
              ) : (
                <ul className="space-y-4">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      data-testid={`signoff-item-${item.id}`}
                      className="rounded-lg border border-gray-800 bg-gray-900 p-4"
                    >
                      <div className="mb-2">
                        <span className="font-mono text-xs text-gray-400">{item.id}</span>{' '}
                        <span className="text-sm text-gray-200">{item.text}</span>
                      </div>
                      <DispositionControl
                        itemId={item.id}
                        value={dispositions[item.id] ?? null}
                        onChange={(d) => setDispositions((prev) => ({ ...prev, [item.id]: d }))}
                      />
                      <input
                        type="text"
                        data-testid={`note-${item.id}`}
                        placeholder="Optional note"
                        value={notes[item.id] ?? ''}
                        onChange={(e) =>
                          setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        className="mt-2 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200"
                      />
                    </li>
                  ))}
                </ul>
              )}

              <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Overall decision
                  </label>
                  <div className="flex gap-2" role="group" aria-label="Overall decision">
                    {DECISIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        data-testid={`decision-${d}`}
                        aria-pressed={decision === d}
                        onClick={() => setDecision(d)}
                        className={`rounded px-2 py-1 text-xs font-medium border ${
                          decision === d
                            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                            : 'border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="signoff-signer"
                    className="mb-1 block text-xs font-semibold uppercase tracking-widest text-gray-500"
                  >
                    Signed off by
                  </label>
                  <input
                    id="signoff-signer"
                    type="text"
                    data-testid="signoff-signer"
                    placeholder="Your name or role"
                    value={signedOffBy}
                    onChange={(e) => setSignedOffBy(e.target.value)}
                    className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-sm text-gray-200"
                  />
                </div>
                <button
                  type="button"
                  data-testid="signoff-submit"
                  disabled={!canSubmit}
                  onClick={() => void submit()}
                  className={`rounded px-4 py-2 text-sm font-semibold ${
                    canSubmit
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                      : 'cursor-not-allowed bg-gray-800 text-gray-500'
                  }`}
                >
                  Record sign-off
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
