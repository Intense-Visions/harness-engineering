import { useMemo } from 'react';
import type { RoutingDecision } from '@harness-engineering/types';

export interface RoutingVolumeCardProps {
  decisions: RoutingDecision[];
  backends: string[];
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Spec B Phase 7 — RoutingVolumeCard. Aggregates the in-memory decision
 * buffer into a 24h count per configured backend (D-OP-4: client-side
 * aggregation only, no server endpoint).
 *
 * **Success-rate semantics (implementation note):** `RoutingDecision` has
 * no `outcome` field — the resolver only emits a decision on a chosen
 * backend (failures throw _before_ `bus.emit`). Therefore success rate
 * hardcodes 100% for any backend with >=1 decision in the window, and
 * em-dash (`—`) for any backend with zero. Adding a richer outcome model
 * is out-of-scope for Phase 7.
 */
export function RoutingVolumeCard({ decisions, backends }: RoutingVolumeCardProps): JSX.Element {
  const counts = useMemo(() => {
    const cutoff = Date.now() - WINDOW_MS;
    const out: Record<string, number> = Object.fromEntries(backends.map((b) => [b, 0]));
    for (const d of decisions) {
      const t = new Date(d.timestamp).getTime();
      if (Number.isNaN(t) || t < cutoff) continue;
      if (!(d.backendName in out)) out[d.backendName] = 0;
      out[d.backendName] = (out[d.backendName] ?? 0) + 1;
    }
    return out;
  }, [decisions, backends]);

  const rows = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));

  return (
    <section
      data-testid="routing-card-volume"
      className="rounded-xl border border-white/[0.06] bg-neutral-surface/30 p-4 backdrop-blur-sm"
    >
      <header className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-muted">
        Per-Backend Volume (24h)
      </header>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-neutral-muted">
            <th className="py-1 pr-3">Backend</th>
            <th className="py-1 pr-3">Count</th>
            <th className="py-1">Success rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, count]) => (
            <tr key={name} className="border-t border-white/[0.04]">
              <td className="py-1 pr-3 font-mono">{name}</td>
              <td className="py-1 pr-3 font-mono" data-testid={`volume-count-${name}`}>
                {count}
              </td>
              <td className="py-1 font-mono" data-testid={`volume-rate-${name}`}>
                {count > 0 ? '100%' : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
