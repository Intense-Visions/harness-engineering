import { useState } from 'react';
import { appendToRoadmap } from '../../utils/appendToRoadmap';
import { useToastStore } from '../../stores/toastStore';

interface Props {
  /**
   * Called after a successful append with the new item's tracker externalId
   * (may be undefined in monolith roadmap mode, which returns only
   * `{ ok, featureName }`). The Roadmap page wires this to its existing
   * roadmap re-fetch so the new backlog item surfaces in the FeatureTable.
   */
  onCreated?: (externalId: string | undefined) => void;
}

/**
 * Author-intent panel for the PM/BA (and dev) roadmap lane.
 *
 * A plain-language, first-class intent-capture form — no chat thread, no slash
 * command, no terminal. It writes through the shipped `appendToRoadmap`
 * (`POST /api/roadmap/append`) and reuses the shipped toast/conflict plumbing:
 * on a TRACKER_CONFLICT the helper pushes the conflict toast surfaced by the
 * page's `ConflictToastRegion`, and this form preserves the entered content for
 * a retry. On success it clears, pushes a success toast, and asks the page to
 * re-fetch the roadmap.
 *
 * This is presentation-only, like the lanes themselves: it invents no endpoint,
 * store, or role, and is not an access-control boundary (a hand-typed request
 * still reaches the endpoint regardless of lane).
 */
export function AuthorIntentForm({ onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const success = useToastStore((s) => s.success);
  const clearSuccess = useToastStore((s) => s.clearSuccess);
  const pushSuccess = useToastStore((s) => s.pushSuccess);

  const canSubmit = title.trim().length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return; // AC4: whitespace-only title never submits
    setSubmitting(true);
    // AC2: summary omitted when Description is empty (server defaults it to the
    // title), otherwise the trimmed free-text description.
    const summary = description.trim();
    const result = await appendToRoadmap({
      title: t,
      summary: summary.length > 0 ? summary : undefined,
    });
    setSubmitting(false);
    if (result.ok) {
      // AC3: clear the fields, confirm with a success toast, and let the page
      // re-fetch so the new row lands in the FeatureTable.
      setTitle('');
      setDescription('');
      pushSuccess({ message: `Added “${result.featureName ?? t}” to the roadmap.` });
      onCreated?.(result.externalId);
    }
    // AC5: on conflict/error appendToRoadmap has already surfaced the toast;
    // leave Title/Description untouched so the user can retry.
  };

  return (
    <section
      aria-labelledby="author-intent-heading"
      className="rounded-lg border border-gray-800 bg-gray-900 p-4"
    >
      <h2
        id="author-intent-heading"
        className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500"
      >
        Author intent
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        State what you want built — plain language, no jargon. It joins the backlog for a human to
        pick up.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2">
        <div>
          <label
            htmlFor="author-intent-title"
            className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-gray-400"
          >
            What do you want built?
          </label>
          <input
            id="author-intent-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. A weekly progress digest for stakeholders"
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-primary-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="author-intent-description"
            className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-gray-400"
          >
            Any detail (optional)
          </label>
          <textarea
            id="author-intent-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Any detail — plain language, no jargon."
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-primary-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-end gap-3">
          {success && success.kind === 'success' && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 text-xs text-emerald-400"
            >
              <span data-testid="author-intent-success">{success.message}</span>
              <button
                type="button"
                aria-label="Dismiss confirmation"
                onClick={clearSuccess}
                className="rounded px-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300 hover:text-emerald-100"
              >
                Dismiss
              </button>
            </div>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded bg-primary-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-primary-400 disabled:opacity-40"
          >
            {submitting ? 'Adding…' : 'Add to roadmap'}
          </button>
        </div>
      </form>
    </section>
  );
}
