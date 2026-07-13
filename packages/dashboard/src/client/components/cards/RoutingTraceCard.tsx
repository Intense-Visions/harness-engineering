import { useState } from 'react';
import type { RoutingUseCase } from '@harness-engineering/types';
import type { RoutingTraceResponse } from '../../types/routing';

type ResolutionStep = RoutingTraceResponse['decision']['resolutionPath'][number];

/** Tailwind color for a resolution step's outcome badge. */
function outcomeClass(outcome: ResolutionStep['outcome']): string {
  if (outcome === 'chosen') return 'text-emerald-300';
  if (outcome === 'unknown-backend') return 'text-rose-400';
  return 'text-neutral-muted';
}

/** One `<li>` in the resolution path list. */
function ResolutionStepItem({ step }: { step: ResolutionStep }): JSX.Element {
  return (
    <li>
      <span className="text-neutral-muted">{step.source}</span>
      {' → '}
      <span>{step.candidate}</span>
      {' ('}
      <span className={outcomeClass(step.outcome)}>{step.outcome}</span>
      {')'}
    </li>
  );
}

/**
 * Spec B Phase 7 — RoutingTraceCard. Plain-input dry-run form
 * (D-OP-6) for POST /api/v1/routing/trace. Builds a UseCase matching
 * the server's Zod discriminated union:
 *   - skill only           → { kind: 'skill', skillName }
 *   - skill + mode         → { kind: 'skill', skillName, cognitiveMode }
 *   - mode only            → { kind: 'mode', cognitiveMode }
 *   - neither              → blocked client-side (no fetch fired)
 *
 * Schema source: packages/orchestrator/src/server/routes/v1/routing.ts
 * (UseCaseSchema discriminated union). If schema evolves, update here.
 */
export function RoutingTraceCard(): JSX.Element {
  const [skill, setSkill] = useState('');
  const [mode, setMode] = useState('');
  const [result, setResult] = useState<RoutingTraceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function buildUseCase(): RoutingUseCase | null {
    const s = skill.trim();
    const m = mode.trim();
    if (s && m) return { kind: 'skill', skillName: s, cognitiveMode: m };
    if (s) return { kind: 'skill', skillName: s };
    if (m) return { kind: 'mode', cognitiveMode: m };
    return null;
  }

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);
    setValidationError(null);
    setResult(null);
    const useCase = buildUseCase();
    if (!useCase) {
      setValidationError('Provide a skill or a mode.');
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        const res = await fetch('/api/v1/routing/trace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ useCase }),
        });
        if (!res.ok) {
          const text = await res.text();
          setError(text || `HTTP ${res.status}`);
          return;
        }
        const json = (await res.json()) as RoutingTraceResponse;
        setResult(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <section
      data-testid="routing-card-trace"
      className="rounded-xl border border-white/[0.06] bg-neutral-surface/30 p-4 backdrop-blur-sm"
    >
      <header className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-muted">
        Trace
      </header>
      <form onSubmit={onSubmit} className="space-y-2 text-xs">
        <label className="block">
          <span className="block text-neutral-muted">Skill</span>
          <input
            type="text"
            name="skill"
            aria-label="skill"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            className="mt-1 w-full rounded border border-white/[0.08] bg-neutral-bg/50 px-2 py-1"
          />
        </label>
        <label className="block">
          <span className="block text-neutral-muted">Mode</span>
          <input
            type="text"
            name="mode"
            aria-label="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="mt-1 w-full rounded border border-white/[0.08] bg-neutral-bg/50 px-2 py-1"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-emerald-500/20 px-3 py-1 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {busy ? 'Tracing…' : 'Trace'}
        </button>
        {validationError ? <p className="text-rose-400">{validationError}</p> : null}
      </form>
      {error ? (
        <p data-testid="trace-error" className="mt-3 text-xs text-rose-400">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="mt-3 space-y-1 text-xs">
          <p>
            <span className="text-neutral-muted">Backend: </span>
            <span data-testid="trace-backend" className="font-mono">
              {result.decision.backendName}
            </span>
          </p>
          <p>
            <span className="text-neutral-muted">Type: </span>
            <span data-testid="trace-backend-type" className="font-mono">
              {result.def.type}
            </span>
          </p>
          <ol
            data-testid="trace-resolution-path"
            className="ml-4 list-decimal text-[11px] font-mono"
          >
            {result.decision.resolutionPath.map((step, i) => (
              <ResolutionStepItem key={i} step={step} />
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
