import type { RoutingDecision, RoutingUseCase } from '@harness-engineering/types';

export interface RoutingChainsCardProps {
  resolvedChains: Record<string, { candidate: string; exists: boolean }[]>;
  decisions: RoutingDecision[];
}

/**
 * Spec B Phase 7 — convert a RoutingUseCase into the canonical key
 * used by the server's buildResolvedChains. Mirror of the server's
 * key format (`skill:{name}`, `mode:{cm}`, `tier:{t}`,
 * `intelligence:{layer}`, `isolation:{tier}`, `default` for chat).
 */
function useCaseToKey(uc: RoutingUseCase): string {
  switch (uc.kind) {
    case 'skill':
      return `skill:${uc.skillName}`;
    case 'mode':
      return `mode:${uc.cognitiveMode}`;
    case 'tier':
      return `tier:${uc.tier}`;
    case 'intelligence':
      return `intelligence:${uc.layer}`;
    case 'isolation':
      return `isolation:${uc.tier}`;
    case 'maintenance':
      return 'maintenance';
    case 'chat':
      return 'default';
    default:
      return 'default';
  }
}

/**
 * Spec B Phase 7 — RoutingChainsCard. Renders one row per resolved chain
 * (server-built from `routing.skills`, `routing.modes`, etc.), highlighting
 * `exists:true` candidates as chosen and `exists:false` as unknown-backend.
 * The "Currently chosen" column reflects the most-recent decision for that
 * use case (or em-dash if none).
 */
export function RoutingChainsCard({
  resolvedChains,
  decisions,
}: RoutingChainsCardProps): JSX.Element {
  const latestByKey = new Map<string, string>();
  for (const d of decisions) {
    const key = useCaseToKey(d.useCase);
    if (!latestByKey.has(key)) latestByKey.set(key, d.backendName);
  }

  return (
    <section
      data-testid="routing-card-chains"
      className="rounded-xl border border-white/[0.06] bg-neutral-surface/30 p-4 backdrop-blur-sm"
    >
      <header className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-muted">
        Resolved Chains
      </header>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-neutral-muted">
            <th className="py-1 pr-3">Use case</th>
            <th className="py-1 pr-3">Chain</th>
            <th className="py-1">Currently chosen</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(resolvedChains).map(([key, chain]) => {
            const chosen = latestByKey.get(key);
            return (
              <tr
                key={key}
                data-testid={`chain-row-${key}`}
                className="border-t border-white/[0.04]"
              >
                <td className="py-1 pr-3 font-mono">{key}</td>
                <td className="py-1 pr-3">
                  {chain.map((step, i) => (
                    <span
                      key={`${step.candidate}-${i}`}
                      data-testid={step.exists ? 'chain-step-chosen' : 'chain-step-unknown'}
                      className={
                        step.exists ? 'text-emerald-300' : 'text-rose-400 line-through opacity-70'
                      }
                    >
                      {step.candidate}
                      {i < chain.length - 1 ? ' → ' : ''}
                    </span>
                  ))}
                </td>
                <td className="py-1 font-mono" data-testid={`currently-chosen-${key}`}>
                  {chosen ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
