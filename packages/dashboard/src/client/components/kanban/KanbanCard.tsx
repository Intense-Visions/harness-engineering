import type { KanbanCard as KanbanCardData } from '../../utils/kanban-lanes';
import { phaseColor, formatElapsed } from '../../utils/phase-presentation';

interface Props {
  card: KanbanCardData;
  /** Identifiers of other in-flight cards, for dependency cross-linking. */
  onBoardIdentifiers: Set<string>;
  /** Current epoch-ms, threaded in so elapsed timers tick from one source. */
  nowMs: number;
}

/** Last path segment of a worktree path, for compact display. */
function basename(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** A single work-in-flight task card. */
export function KanbanCard({ card, onBoardIdentifiers, nowMs }: Props) {
  return (
    <div
      data-testid="kanban-card"
      data-identifier={card.identifier}
      className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2.5 text-left"
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{card.title}</span>
        {card.phase && (
          <span
            className={`inline-block flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${phaseColor(
              card.phase
            )}`}
          >
            {card.phase}
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
        <span className="font-mono">{card.identifier}</span>
        {card.backendName && (
          <>
            <span className="text-gray-700">|</span>
            <span className="text-blue-400">{card.backendName}</span>
          </>
        )}
        {card.startedAt && (
          <>
            <span className="text-gray-700">|</span>
            <span className="tabular-nums text-gray-400">
              {formatElapsed(card.startedAt, nowMs)}
            </span>
          </>
        )}
        {card.attempt !== null && (
          <>
            <span className="text-gray-700">|</span>
            <span>#{card.attempt}</span>
          </>
        )}
      </div>

      {card.workspacePath && (
        <div
          className="mt-1 truncate font-mono text-[11px] text-gray-600"
          title={card.workspacePath}
        >
          ⌥ {basename(card.workspacePath)}
        </div>
      )}

      {card.blockerReason && (
        <div className="mt-1 text-[11px] font-medium text-red-400">
          Blocked: {card.blockerReason}
        </div>
      )}

      {card.blockedBy.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-gray-600">blocked by</span>
          {card.blockedBy.map((blocker, i) => {
            const label = blocker.identifier ?? blocker.id ?? 'unknown';
            const onBoard =
              blocker.identifier !== null && onBoardIdentifiers.has(blocker.identifier);
            return (
              <span
                key={`${label}-${i}`}
                className={[
                  'rounded px-1.5 py-0.5 text-[10px] font-mono',
                  onBoard
                    ? 'bg-amber-900/40 text-amber-300 ring-1 ring-amber-500/40'
                    : 'bg-gray-800 text-gray-400',
                ].join(' ')}
                title={onBoard ? 'Also in flight on this board' : undefined}
              >
                {label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
