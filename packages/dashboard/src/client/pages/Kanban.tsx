import { useEffect, useState } from 'react';
import { useOrchestratorSocket } from '../hooks/useOrchestratorSocket';
import { deriveLanes, indexBoardIdentifiers } from '../utils/kanban-lanes';
import { KanbanLane } from '../components/kanban/KanbanLane';

/** Ticking timer that updates every second, for live elapsed displays. */
function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

/**
 * Work in Flight — a live kanban of orchestrator/parallel-coordinator state.
 * Read-only: it derives lanes from the same WebSocket snapshot the Orchestrator
 * monitor consumes, so there are no server-side changes.
 */
export function Kanban() {
  const { snapshot, connected } = useOrchestratorSocket();
  const nowMs = useNow();

  return (
    <div className="flex flex-1 flex-col p-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold text-white">Work in Flight</h1>
        <span
          className={`inline-flex h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-gray-600'}`}
          title={connected ? 'Connected' : 'Disconnected'}
        />
      </div>

      {!snapshot ? (
        <EmptyState
          message={connected ? 'Waiting for orchestrator state…' : 'Orchestrator not connected.'}
        />
      ) : (
        <KanbanBoard snapshot={snapshot} nowMs={nowMs} />
      )}
    </div>
  );
}

function KanbanBoard({
  snapshot,
  nowMs,
}: {
  snapshot: NonNullable<ReturnType<typeof useOrchestratorSocket>['snapshot']>;
  nowMs: number;
}) {
  const lanes = deriveLanes(snapshot);
  const onBoardIdentifiers = indexBoardIdentifiers(lanes);
  const isEmpty = lanes.every((lane) => lane.cards.length === 0);
  const inCooldown =
    snapshot.globalCooldownUntilMs !== null && Date.now() < snapshot.globalCooldownUntilMs;

  if (isEmpty) {
    return <EmptyState message="No work in flight." />;
  }

  return (
    <>
      {inCooldown && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-orange-900/60 bg-orange-950/30 px-4 py-2 text-sm text-orange-300"
        >
          Global cooldown active — dispatch is paused while rate limits recover.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {lanes.map((lane) => (
          <KanbanLane
            key={lane.id}
            lane={lane}
            onBoardIdentifiers={onBoardIdentifiers}
            nowMs={nowMs}
          />
        ))}
      </div>
    </>
  );
}
