import { useEffect, useState } from 'react';
import { Activity, Clock, Zap } from 'lucide-react';

interface Props {
  phase: string | null;
  skill: string | null;
  startedAt: number | null;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function StatusSection({ phase, skill, startedAt }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!phase && !skill) return null;

  return (
    <div className="border-b border-white/[0.06] pb-3">
      <div className="flex items-center gap-2 mb-2">
        <Activity size={12} className="text-neutral-muted" />
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted">
          Status
        </h4>
      </div>
      <div className="flex flex-col gap-1.5">
        {phase && (
          <div className="flex items-center gap-2">
            <Zap size={12} className="text-primary-500" />
            <span className="text-xs text-neutral-text">{phase}</span>
          </div>
        )}
        {skill && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-muted">Skill:</span>
            <span className="text-xs text-neutral-text font-mono">{skill}</span>
          </div>
        )}
        {startedAt && (
          <div className="flex items-center gap-2">
            <Clock size={12} className="text-neutral-muted" />
            <span className="text-xs text-neutral-muted tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
