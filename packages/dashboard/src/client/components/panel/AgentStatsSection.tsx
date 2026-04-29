import { useEffect, useState } from 'react';
import { Cpu, Zap, Clock, ArrowUpDown, RotateCw, GitPullRequest } from 'lucide-react';

export interface AgentStats {
  identifier: string;
  phase: string;
  backendName: string | null;
  description: string | null;
  turnCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  startedAt: number | null;
  durationMs: number | null;
  isRunning: boolean;
  pr: { number: number; status: string } | null;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

interface Props {
  stats: AgentStats;
}

export function AgentStatsSection({ stats }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!stats.startedAt || !stats.isRunning) return;
    setElapsed(Date.now() - stats.startedAt);
    const interval = setInterval(() => {
      setElapsed(Date.now() - stats.startedAt!);
    }, 1000);
    return () => clearInterval(interval);
  }, [stats.startedAt, stats.isRunning]);

  return (
    <div className="border-b border-white/[0.06] pb-3">
      {/* Agent Details */}
      <div className="flex items-center gap-2 mb-2">
        <Cpu size={12} className="text-semantic-success" />
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted">
          Agent Details
        </h4>
      </div>
      <div className="flex flex-col gap-1.5 mb-3">
        <div className="flex justify-between text-xs">
          <span className="text-neutral-muted">Identifier</span>
          <span className="font-mono text-neutral-text truncate ml-3 text-right max-w-[160px]">
            {stats.identifier}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-neutral-muted">Phase</span>
          <span className="text-semantic-success font-medium">{stats.phase}</span>
        </div>
        {stats.backendName && (
          <div className="flex justify-between text-xs">
            <span className="text-neutral-muted">Backend</span>
            <span className="text-primary-500 font-mono">{stats.backendName}</span>
          </div>
        )}
        {stats.pr && (
          <div className="flex justify-between text-xs">
            <span className="text-neutral-muted">PR</span>
            <span className="flex items-center gap-1 text-primary-500">
              <GitPullRequest size={10} />#{stats.pr.number}
              <span className="text-neutral-muted text-[10px]">{stats.pr.status}</span>
            </span>
          </div>
        )}
      </div>

      {/* Session Stats */}
      {stats.totalTokens > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap size={10} className="text-neutral-muted" />
            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-neutral-muted">
              Session Stats
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center">
              <span className="block text-sm font-bold text-neutral-text">{stats.turnCount}</span>
              <span className="text-[8px] uppercase tracking-widest text-neutral-muted">Turns</span>
            </div>
            <div className="text-center">
              <span className="block text-sm font-bold text-neutral-text">
                {formatTokens(stats.totalTokens)}
              </span>
              <span className="text-[8px] uppercase tracking-widest text-neutral-muted">
                Tokens
              </span>
            </div>
            <div className="text-center">
              <span className="block text-sm font-bold text-semantic-success">
                {formatTokens(stats.inputTokens)}
              </span>
              <span className="text-[8px] uppercase tracking-widest text-neutral-muted">Input</span>
            </div>
            <div className="text-center">
              <span className="block text-sm font-bold text-primary-500">
                {formatTokens(stats.outputTokens)}
              </span>
              <span className="text-[8px] uppercase tracking-widest text-neutral-muted">
                Output
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Duration */}
      <div className="flex items-center gap-2 text-xs text-neutral-muted">
        {stats.isRunning ? (
          <>
            <RotateCw size={10} className="animate-spin" />
            <span>Running for {formatElapsed(elapsed)}</span>
          </>
        ) : stats.durationMs ? (
          <>
            <Clock size={10} />
            <span>Duration: {formatElapsed(stats.durationMs)}</span>
          </>
        ) : stats.startedAt ? (
          <>
            <ArrowUpDown size={10} />
            <span>{formatElapsed(Date.now() - stats.startedAt)}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
