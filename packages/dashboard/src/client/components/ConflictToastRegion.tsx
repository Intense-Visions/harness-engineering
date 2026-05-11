import { useEffect } from 'react';
import { useToastStore } from '../stores/toastStore';
import { CONFLICT_TOAST_TEMPLATE } from '../../shared/types';

interface Props {
  /**
   * Called when a conflict toast appears. Receives the externalId so the
   * parent can refetch the roadmap and scroll to the contested row.
   * Promise return is awaited so the parent can sequence refetch + scroll.
   */
  onRefresh: (externalId: string) => Promise<void> | void;
}

export function ConflictToastRegion({ onRefresh }: Props) {
  const current = useToastStore((s) => s.current);
  const clear = useToastStore((s) => s.clear);

  // Trigger the refresh callback whenever a new conflict appears.
  // `seq` ensures re-firing for repeat conflicts on the same externalId.
  useEffect(() => {
    if (current && current.kind === 'conflict') {
      void onRefresh(current.externalId);
    }
  }, [current?.seq, current?.externalId, onRefresh, current]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-6 right-6 z-50 max-w-sm"
    >
      {current && current.kind === 'conflict' && (
        <div
          data-testid="conflict-toast-body"
          className="pointer-events-auto flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 shadow-xl backdrop-blur"
        >
          <span className="flex-1">{CONFLICT_TOAST_TEMPLATE(current.conflictedWith)}</span>
          <button
            type="button"
            aria-label="Dismiss conflict notice"
            onClick={clear}
            className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300 hover:text-amber-100"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
