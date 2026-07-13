/**
 * Phase 4: live snapshot of the SQLite delivery queue. Source is
 * GET /api/v1/webhooks/queue/stats, polled at 1s. Spec D7 confirms
 * REST polling (not SSE) because the panel needs only a periodic
 * counter, not per-row events.
 */
export interface QueueStats {
  pending: number;
  inFlight: number;
  failed: number;
  dead: number;
  delivered: number;
}

function StatCell({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded bg-white/5 p-2">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-neutral-muted">{label}</div>
    </div>
  );
}

export function QueueStatsPanel({ stats }: { stats: QueueStats }) {
  return (
    <div className="rounded-lg border border-white/10 p-4">
      <h2 className="mb-2 text-sm font-semibold">Delivery Queue</h2>
      <div className="grid grid-cols-5 gap-2 text-center text-xs">
        <StatCell value={stats.pending} label="Pending" />
        <StatCell value={stats.failed} label="Retrying" />
        <StatCell value={stats.inFlight} label="In flight" />
        <div className={`rounded p-2 ${stats.dead > 0 ? 'bg-red-900/30' : 'bg-white/5'}`}>
          <div className={`text-lg font-bold ${stats.dead > 0 ? 'text-red-400' : ''}`}>
            {stats.dead}
          </div>
          <div className="text-neutral-muted">Dead</div>
        </div>
        <StatCell value={stats.delivered} label="Delivered" />
      </div>
    </div>
  );
}
