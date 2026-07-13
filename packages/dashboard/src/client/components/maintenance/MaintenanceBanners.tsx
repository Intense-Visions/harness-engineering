import { useState } from 'react';
import type { MaintenanceData } from './useMaintenanceData';

type MaintenanceEvent = MaintenanceData['maintenanceEvent'];

function InFlightBanner({ inFlightList }: { inFlightList: string[] }) {
  if (inFlightList.length === 0) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
      <span className="text-sm text-blue-300">
        {inFlightList.length === 1 ? (
          <>
            Running: <span className="font-mono font-semibold">{inFlightList[0]}</span>
          </>
        ) : (
          <>
            Running {inFlightList.length} tasks:{' '}
            <span className="font-mono font-semibold">{inFlightList.join(', ')}</span>
          </>
        )}
      </span>
    </div>
  );
}

function ErrorEventBanner({ event }: { event: MaintenanceEvent }) {
  if (event?.type !== 'maintenance:error') return null;
  return (
    <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2">
      <span className="text-sm text-red-300">
        Task <span className="font-mono font-semibold">{event.data.taskId}</span> failed
        {event.data.error ? `: ${event.data.error}` : ''}
      </span>
    </div>
  );
}

function BaserefFallbackBanner({ event }: { event: MaintenanceEvent }) {
  // Tracks the (ref, repoRoot) of a baseref_fallback banner the user closed.
  // The banner re-appears automatically when a fallback with a different
  // identity arrives (covers the multi-worktree case).
  const [dismissed, setDismissed] = useState<{ ref: string; repoRoot: string } | null>(null);

  if (event?.type !== 'maintenance:baseref_fallback') return null;
  const { ref, repoRoot } = event.data;
  if (dismissed?.ref === ref && dismissed?.repoRoot === repoRoot) return null;

  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
      <span className="text-sm text-amber-300">
        Worktree base-ref fell back to local <span className="font-mono font-semibold">{ref}</span>{' '}
        (repo: <span className="font-mono">{repoRoot}</span>). Origin may be misconfigured or
        unreachable.
      </span>
      <button
        type="button"
        aria-label="Dismiss baseref fallback warning"
        onClick={() => setDismissed({ ref, repoRoot })}
        className="shrink-0 rounded p-0.5 text-amber-300/80 transition-colors hover:bg-amber-500/20 hover:text-amber-200"
      >
        <span aria-hidden="true" className="text-base leading-none">
          ×
        </span>
      </button>
    </div>
  );
}

export function MaintenanceBanners({
  inFlightList,
  maintenanceEvent,
}: {
  inFlightList: string[];
  maintenanceEvent: MaintenanceEvent;
}) {
  return (
    <>
      <InFlightBanner inFlightList={inFlightList} />
      <ErrorEventBanner event={maintenanceEvent} />
      <BaserefFallbackBanner event={maintenanceEvent} />
    </>
  );
}
