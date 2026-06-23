import type { SignalResult, SignalStatus } from '../types/signals';
import { Sparkline } from './Sparkline';

// Status → token CLASS (CSS-var-backed tailwind utility). No hex; avoids DRIFT-T001.
const STATUS_CLASS: Record<SignalStatus, string> = {
  ok: 'text-emerald-400',
  warn: 'text-yellow-400',
  alert: 'text-red-400',
  pending: 'text-neutral-muted',
  error: 'text-neutral-muted',
};

const TREND_ARROW: Record<SignalResult['trend'], string> = {
  up: '↑',
  down: '↓',
  flat: '→',
};

// Render guard: null → em dash; numbers rounded to 1 decimal (drops trailing .0).
function formatValue(value: number | null): string {
  if (value == null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function SignalCard({ signal }: { signal: SignalResult }) {
  const isMuted = signal.status === 'pending' || signal.status === 'error';
  const colorClass = STATUS_CLASS[signal.status];

  return (
    <div
      data-testid={`signal-card-${signal.id}`}
      className="rounded-lg border border-neutral-border bg-neutral-surface p-5"
    >
      <p className="text-xs font-medium uppercase tracking-widest text-neutral-muted">
        {signal.label}
      </p>

      {isMuted ? (
        <p className="mt-3 text-sm text-neutral-muted">{signal.detail}</p>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              data-testid="signal-value"
              className={`text-3xl font-bold tabular-nums ${colorClass}`}
            >
              {formatValue(signal.value)}
              <span className="ml-0.5 text-base font-medium text-neutral-muted">{signal.unit}</span>
            </span>
            <span
              data-testid="signal-trend"
              className={`text-lg ${colorClass}`}
              aria-label={`trend ${signal.trend}`}
            >
              {TREND_ARROW[signal.trend]}
            </span>
          </div>
          <div className={`mt-3 ${colorClass}`}>
            <Sparkline points={signal.history} />
          </div>
          <p className="mt-2 text-xs text-neutral-muted">{signal.detail}</p>
        </>
      )}
    </div>
  );
}
