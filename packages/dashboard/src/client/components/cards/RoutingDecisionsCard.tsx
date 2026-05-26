import { useMemo, useState } from 'react';
import type { RoutingDecision, RoutingUseCase } from '@harness-engineering/types';
import type { RoutingWsStatus } from '../../types/routing';

export interface RoutingDecisionsCardProps {
  decisions: RoutingDecision[];
  status: RoutingWsStatus;
  error: string | null;
}

function useCaseSkill(uc: RoutingUseCase): string | null {
  return uc.kind === 'skill' ? uc.skillName : null;
}
function useCaseMode(uc: RoutingUseCase): string | null {
  if (uc.kind === 'mode') return uc.cognitiveMode;
  if (uc.kind === 'skill' && uc.cognitiveMode) return uc.cognitiveMode;
  return null;
}
function useCaseLabel(uc: RoutingUseCase): string {
  switch (uc.kind) {
    case 'skill':
      return `skill:${uc.skillName}${uc.cognitiveMode ? `@${uc.cognitiveMode}` : ''}`;
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
      return 'chat';
    default:
      return 'unknown';
  }
}

/**
 * Spec B Phase 7 — RoutingDecisionsCard. Renders the in-memory ring buffer
 * of recent routing decisions with client-side filter controls (skill /
 * mode / backend) and click-to-expand rows that reveal the full
 * resolutionPath. Surfaces `routing-ws-status` for the WS health indicator
 * (Truth 5).
 */
export function RoutingDecisionsCard({
  decisions,
  status,
  error,
}: RoutingDecisionsCardProps): JSX.Element {
  const [skillFilter, setSkillFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [backendFilter, setBackendFilter] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return decisions.filter((d) => {
      if (skillFilter) {
        const s = useCaseSkill(d.useCase);
        if (!s || !s.includes(skillFilter)) return false;
      }
      if (modeFilter) {
        const m = useCaseMode(d.useCase);
        if (!m || !m.includes(modeFilter)) return false;
      }
      if (backendFilter && !d.backendName.includes(backendFilter)) return false;
      return true;
    });
  }, [decisions, skillFilter, modeFilter, backendFilter]);

  return (
    <section
      data-testid="routing-card-decisions"
      className="rounded-xl border border-white/[0.06] bg-neutral-surface/30 p-4 backdrop-blur-sm"
    >
      <header className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold uppercase tracking-wide text-neutral-muted">
          Recent Decisions
        </span>
        <span
          data-testid="routing-ws-status"
          className={
            status === 'live'
              ? 'text-xs text-emerald-300'
              : status === 'polling'
                ? 'text-xs text-amber-300'
                : 'text-xs text-neutral-muted'
          }
        >
          {status}
        </span>
      </header>
      <div className="mb-3 flex gap-2 text-xs">
        <input
          data-testid="decision-filter-skill"
          placeholder="filter skill…"
          value={skillFilter}
          onChange={(e) => setSkillFilter(e.target.value)}
          className="rounded border border-white/[0.08] bg-neutral-bg/50 px-2 py-1"
        />
        <input
          data-testid="decision-filter-mode"
          placeholder="filter mode…"
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value)}
          className="rounded border border-white/[0.08] bg-neutral-bg/50 px-2 py-1"
        />
        <input
          data-testid="decision-filter-backend"
          placeholder="filter backend…"
          value={backendFilter}
          onChange={(e) => setBackendFilter(e.target.value)}
          className="rounded border border-white/[0.08] bg-neutral-bg/50 px-2 py-1"
        />
      </div>
      {error ? (
        <p data-testid="decisions-error" className="text-xs text-rose-400">
          {error}
        </p>
      ) : null}
      {filtered.length === 0 ? (
        <p data-testid="decisions-empty" className="text-xs text-neutral-muted">
          No routing decisions recorded yet.
        </p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-neutral-muted">
              <th className="py-1 pr-3">Time</th>
              <th className="py-1 pr-3">Use case</th>
              <th className="py-1 pr-3">Backend</th>
              <th className="py-1">ms</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <RowGroup
                key={`${d.timestamp}-${i}`}
                decision={d}
                index={i}
                expanded={expanded === i}
                onToggle={() => setExpanded((cur) => (cur === i ? null : i))}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

interface RowGroupProps {
  decision: RoutingDecision;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}

function RowGroup({ decision, index, expanded, onToggle }: RowGroupProps): JSX.Element {
  return (
    <>
      <tr
        data-testid={`decision-row-${index}`}
        onClick={onToggle}
        className="cursor-pointer border-t border-white/[0.04] hover:bg-white/[0.04]"
      >
        <td className="py-1 pr-3 font-mono text-[10px] text-neutral-muted">
          {new Date(decision.timestamp).toLocaleTimeString()}
        </td>
        <td className="py-1 pr-3 font-mono">{useCaseLabel(decision.useCase)}</td>
        <td className="py-1 pr-3 font-mono">{decision.backendName}</td>
        <td className="py-1">{decision.durationMs}</td>
      </tr>
      {expanded ? (
        <tr>
          <td
            colSpan={4}
            data-testid={`decision-row-${index}-expanded`}
            className="bg-black/30 p-2"
          >
            <ol className="ml-4 list-decimal text-[11px]">
              {decision.resolutionPath.map((step, j) => (
                <li key={j} className="font-mono">
                  <span className="text-neutral-muted">{step.source}</span>
                  {' → '}
                  <span>{step.candidate}</span>
                  {' ('}
                  <span
                    className={
                      step.outcome === 'chosen'
                        ? 'text-emerald-300'
                        : step.outcome === 'unknown-backend'
                          ? 'text-rose-400'
                          : 'text-neutral-muted'
                    }
                  >
                    {step.outcome}
                  </span>
                  {')'}
                </li>
              ))}
            </ol>
          </td>
        </tr>
      ) : null}
    </>
  );
}
