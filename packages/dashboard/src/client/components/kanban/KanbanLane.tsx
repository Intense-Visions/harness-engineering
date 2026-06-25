import type { KanbanLane as KanbanLaneData } from '../../utils/kanban-lanes';
import { KanbanCard } from './KanbanCard';

interface Props {
  lane: KanbanLaneData;
  onBoardIdentifiers: Set<string>;
  nowMs: number;
}

/** One kanban column. The `done` lane renders compact id chips. */
export function KanbanLane({ lane, onBoardIdentifiers, nowMs }: Props) {
  return (
    <div
      data-testid={`lane-${lane.id}`}
      className="flex min-w-0 flex-col rounded-lg border border-gray-800 bg-gray-950/40 p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          {lane.label}
        </h3>
        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] tabular-nums text-gray-400">
          {lane.cards.length}
        </span>
      </div>

      {lane.cards.length === 0 ? (
        <p className="px-1 py-4 text-center text-xs text-gray-700">—</p>
      ) : lane.id === 'done' ? (
        <div className="flex flex-wrap gap-1">
          {lane.cards.map((card) => (
            <span
              key={card.issueId}
              className="rounded bg-gray-800/60 px-1.5 py-0.5 font-mono text-[10px] text-gray-400"
            >
              {card.identifier}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {lane.cards.map((card) => (
            <KanbanCard
              key={card.issueId}
              card={card}
              onBoardIdentifiers={onBoardIdentifiers}
              nowMs={nowMs}
            />
          ))}
        </div>
      )}
    </div>
  );
}
