import { useEffect, useMemo, useState } from 'react';
import { useOrchestratorSocket } from '../hooks/useOrchestratorSocket';
import { useRecentSessions } from '../hooks/useRecentSessions';
import { AgentStreamDrawer } from '../components/agents/AgentStreamDrawer';
import { AssistantBlocks } from '../components/chat/AssistantBlocks';
import type { ContentBlock } from '../types/chat';
import type { StreamManifest } from '../hooks/useStreamReplay';
import type { OrchestratorSnapshot, RunningAgent, TickActivity } from '../types/orchestrator';

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">{title}</h2>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

/** Human-readable elapsed time since a given ISO timestamp. */
function useElapsed(startedAt: string): string {
  const now = useNow();

  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** Ticking timer that updates every second. */
function useNow(): number {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return now;
}

/** Colored phase badge. */
function PhaseBadge({ phase }: { phase: string }) {
  const colorMap: Record<string, string> = {
    PreparingWorkspace: 'bg-yellow-900/50 text-yellow-400',
    BuildingPrompt: 'bg-yellow-900/50 text-yellow-400',
    LaunchingAgent: 'bg-blue-900/50 text-blue-400',
    InitializingSession: 'bg-blue-900/50 text-blue-400',
    StreamingTurn: 'bg-emerald-900/50 text-emerald-400',
    Finishing: 'bg-purple-900/50 text-purple-400',
    Succeeded: 'bg-emerald-900/50 text-emerald-300',
    Failed: 'bg-red-900/50 text-red-400',
    TimedOut: 'bg-red-900/50 text-red-400',
    Stalled: 'bg-orange-900/50 text-orange-400',
    CanceledByReconciliation: 'bg-gray-800 text-gray-400',
  };
  const color = colorMap[phase] ?? 'bg-gray-800 text-gray-400';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}>{phase}</span>
  );
}

function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const elapsed = useElapsed(startedAt);
  return <span className="tabular-nums text-gray-400">{elapsed}</span>;
}

function RateLimitsCard({ snapshot }: { snapshot: OrchestratorSnapshot }) {
  const isCooldown =
    snapshot.globalCooldownUntilMs !== null && Date.now() < snapshot.globalCooldownUntilMs;

  const now = Date.now();
  const recentReqCount = snapshot.recentRequestTimestamps.filter((ts) => now - ts < 60000).length;
  const recentInputTokens = snapshot.recentInputTokens
    .filter((t) => now - t.timestamp < 60000)
    .reduce((sum, t) => sum + t.tokens, 0);
  const recentOutputTokens = snapshot.recentOutputTokens
    .filter((t) => now - t.timestamp < 60000)
    .reduce((sum, t) => sum + t.tokens, 0);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <SectionHeader title="Rate Limits" />
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Status</span>
          <span className={isCooldown ? 'font-semibold text-red-400' : 'text-emerald-400'}>
            {isCooldown ? 'COOLDOWN' : 'OK'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Req/Min</span>
          <span className="text-blue-400">
            {recentReqCount} / {snapshot.maxRequestsPerMinute}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Req/Sec</span>
          <span className="text-blue-400">{snapshot.maxRequestsPerSecond} max</span>
        </div>
        {snapshot.maxInputTokensPerMinute > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-400">ITPM</span>
            <span className="text-yellow-400">
              {formatNumber(recentInputTokens)} / {formatNumber(snapshot.maxInputTokensPerMinute)}
            </span>
          </div>
        )}
        {snapshot.maxOutputTokensPerMinute > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-400">OTPM</span>
            <span className="text-yellow-400">
              {formatNumber(recentOutputTokens)} / {formatNumber(snapshot.maxOutputTokensPerMinute)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ConcurrencyCard({ snapshot }: { snapshot: OrchestratorSnapshot }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <SectionHeader title="Concurrency" />
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Active</span>
          <span className={snapshot.running.length > 0 ? 'text-emerald-400' : 'text-gray-500'}>
            {snapshot.running.length} / {snapshot.maxConcurrentAgents}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Claimed</span>
          <span className="text-cyan-400">{snapshot.claimed.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Retry Queue</span>
          <span className="text-gray-300">{snapshot.retryAttempts.length}</span>
        </div>
      </div>
    </div>
  );
}

function TokenUsageCard({ snapshot }: { snapshot: OrchestratorSnapshot }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <SectionHeader title="Token Usage" />
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Input</span>
          <span className="text-yellow-400">{formatNumber(snapshot.tokenTotals.inputTokens)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Output</span>
          <span className="text-yellow-400">{formatNumber(snapshot.tokenTotals.outputTokens)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Total</span>
          <span className="text-yellow-400">{formatNumber(snapshot.tokenTotals.totalTokens)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Time Running</span>
          <span className="text-blue-400">{Math.round(snapshot.tokenTotals.secondsRunning)}s</span>
        </div>
      </div>
    </div>
  );
}

function PipelineActivity({ activity }: { activity: TickActivity }) {
  if (activity.phase === 'idle') return null;

  const phaseLabel: Record<string, string> = {
    fetching: 'Fetching',
    analyzing: 'Analyzing',
    dispatching: 'Dispatching',
  };

  const phaseColor: Record<string, string> = {
    fetching: 'text-blue-400',
    analyzing: 'text-violet-400',
    dispatching: 'text-emerald-400',
  };

  return (
    <div className="mb-6 rounded-lg border border-violet-800/50 bg-violet-950/20 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" />
        </span>
        <span className={`text-sm font-medium ${phaseColor[activity.phase] ?? 'text-gray-400'}`}>
          {phaseLabel[activity.phase] ?? activity.phase}
        </span>
        {activity.detail && (
          <span className="truncate text-sm text-gray-400">{activity.detail}</span>
        )}
        {activity.progress && (
          <span className="ml-auto text-xs tabular-nums text-gray-500">
            {activity.progress.current}/{activity.progress.total}
          </span>
        )}
      </div>
      {activity.progress && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-800">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-300"
            style={{ width: `${(activity.progress.current / activity.progress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Expandable row showing what an individual agent is working on. */
function AgentCard({
  agent,
  blocks,
  onViewStream,
}: {
  agent: RunningAgent;
  blocks: ContentBlock[];
  onViewStream: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Show last few blocks as a preview
  const previewBlocks = blocks.slice(-5);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/60">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-800/40"
      >
        {/* Pulse indicator for active streaming */}
        <div className="mt-1 flex-shrink-0">
          {agent.phase === 'StreamingTurn' ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-yellow-500" />
          )}
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-white">
              {agent.issue?.title ?? agent.identifier}
            </span>
            <PhaseBadge phase={agent.phase} />
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
            <span className="font-mono">{agent.identifier}</span>
            <span className="text-gray-600">|</span>
            <span className="text-blue-400">{agent.session?.backendName ?? 'pending'}</span>
            <span className="text-gray-600">|</span>
            <ElapsedTimer startedAt={agent.startedAt} />
            {agent.session && (
              <>
                <span className="text-gray-600">|</span>
                <span>
                  T{agent.session.turnCount} &middot; {formatNumber(agent.session.totalTokens)} tok
                </span>
              </>
            )}
          </div>
          {agent.session?.lastMessage && (
            <p className="mt-1.5 truncate text-xs text-gray-400">{agent.session.lastMessage}</p>
          )}
        </div>

        {/* Expand chevron */}
        <span className="mt-1 flex-shrink-0 text-gray-600">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-800 px-4 py-3 text-sm">
          {agent.issue?.description ? (
            <div className="mb-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Description
              </span>
              <p className="mt-1 whitespace-pre-wrap text-gray-300">{agent.issue.description}</p>
            </div>
          ) : (
            <p className="mb-3 text-xs italic text-gray-600">No description available.</p>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Input Tokens</span>
              <span className="text-yellow-400">
                {formatNumber(agent.session?.inputTokens ?? 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Output Tokens</span>
              <span className="text-yellow-400">
                {formatNumber(agent.session?.outputTokens ?? 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Backend</span>
              <span className="text-blue-400">{agent.session?.backendName ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Turns</span>
              <span className="text-gray-300">{agent.session?.turnCount ?? 0}</span>
            </div>
          </div>

          {/* Live activity preview */}
          {previewBlocks.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                  Live Activity
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewStream();
                  }}
                  className="text-xs font-medium text-blue-400 transition-colors hover:text-blue-300"
                >
                  View Full Stream
                </button>
              </div>
              <div className="mt-2 max-h-48 overflow-hidden rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-xs">
                <AssistantBlocks
                  blocks={previewBlocks}
                  isStreaming={agent.phase === 'StreamingTurn'}
                />
              </div>
            </div>
          )}

          {previewBlocks.length === 0 && agent.session?.lastMessage && (
            <div className="mt-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Latest Activity
              </span>
              <p className="mt-1 whitespace-pre-wrap text-gray-300">{agent.session.lastMessage}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AgentsList({
  agents,
  agentEvents,
  onViewStream,
}: {
  agents: RunningAgent[];
  agentEvents: Record<string, ContentBlock[]>;
  onViewStream: (agent: RunningAgent) => void;
}) {
  if (agents.length === 0) {
    return <p className="text-sm italic text-gray-500">No active agents.</p>;
  }

  return (
    <div className="space-y-2">
      {agents.map((agent) => (
        <AgentCard
          key={agent.issueId}
          agent={agent}
          blocks={agentEvents[agent.issueId] ?? []}
          onViewStream={() => onViewStream(agent)}
        />
      ))}
    </div>
  );
}

function RetryQueue({ snapshot }: { snapshot: OrchestratorSnapshot }) {
  const now = useNow();
  if (snapshot.retryAttempts.length === 0) return null;

  const sortedRetries = [...snapshot.retryAttempts].sort((a, b) => a[1].dueAtMs - b[1].dueAtMs);

  return (
    <section className="mt-6">
      <SectionHeader title="Retry Queue" />
      <div className="space-y-1">
        {sortedRetries.map(([, entry]) => {
          const dueIn = Math.max(0, Math.ceil((entry.dueAtMs - now) / 1000));
          return (
            <div
              key={entry.issueId}
              className="flex items-center justify-between rounded border border-gray-800 bg-gray-900/40 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-2 w-2 rounded-full ${dueIn > 0 ? 'bg-orange-500' : 'bg-orange-400 animate-pulse'}`}
                />
                <span className="font-mono text-gray-300">{entry.identifier}</span>
                <span className="text-gray-500">attempt {entry.attempt}</span>
              </div>
              <span
                className={`text-xs ${dueIn > 0 ? 'text-gray-500' : 'text-orange-400 font-medium'}`}
              >
                {dueIn > 0 ? `retries in ${dueIn}s` : 'due now'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-xs text-gray-600">in progress</span>;
  const colorMap: Record<string, string> = {
    normal: 'bg-emerald-900/50 text-emerald-400',
    error: 'bg-red-900/50 text-red-400',
  };
  const color = colorMap[outcome] ?? 'bg-gray-800 text-gray-400';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {outcome}
    </span>
  );
}

function SessionRow({
  session,
  onViewStream,
}: {
  session: StreamManifest;
  onViewStream: (issueId: string) => void;
}) {
  const lastAttempt = session.attempts.at(-1);
  const startedAt = lastAttempt?.startedAt;
  const outcome = lastAttempt?.outcome ?? null;
  const stats = lastAttempt?.stats;

  return (
    <button
      type="button"
      onClick={() => onViewStream(session.issueId)}
      className="flex w-full items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-3 text-left transition-colors hover:bg-gray-800/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-white">{session.identifier}</span>
          <OutcomeBadge outcome={outcome} />
          {session.pr && <span className="text-xs text-blue-400">PR #{session.pr.number}</span>}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
          {startedAt && <span>{formatTimeAgo(startedAt)}</span>}
          {stats && stats.durationMs > 0 && (
            <>
              <span className="text-gray-600">|</span>
              <span>{formatDuration(stats.durationMs)}</span>
            </>
          )}
          {stats && (
            <>
              <span className="text-gray-600">|</span>
              <span>
                T{stats.turnCount} &middot; {formatNumber(stats.inputTokens + stats.outputTokens)}{' '}
                tok
              </span>
            </>
          )}
          {session.attempts.length > 1 && (
            <>
              <span className="text-gray-600">|</span>
              <span>{session.attempts.length} attempts</span>
            </>
          )}
        </div>
      </div>
      <span className="flex-shrink-0 text-gray-600">&rsaquo;</span>
    </button>
  );
}

function RecentSessions({ onViewStream }: { onViewStream: (issueId: string) => void }) {
  const { sessions, loading, error } = useRecentSessions();

  if (loading) {
    return (
      <section className="mt-6">
        <SectionHeader title="Recent Sessions" />
        <p className="text-sm text-gray-500">Loading sessions...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-6">
        <SectionHeader title="Recent Sessions" />
        <p className="text-sm text-red-400">{error}</p>
      </section>
    );
  }

  if (sessions.length === 0) {
    return (
      <section className="mt-6">
        <SectionHeader title="Recent Sessions" />
        <p className="text-sm italic text-gray-500">No recorded sessions yet.</p>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <SectionHeader title="Recent Sessions" />
      <div className="space-y-2">
        {sessions.map((session) => (
          <SessionRow key={session.issueId} session={session} onViewStream={onViewStream} />
        ))}
      </div>
    </section>
  );
}

export function Orchestrator() {
  const { snapshot, agentEvents, connected } = useOrchestratorSocket();
  const [drawerIssueId, setDrawerIssueId] = useState<string | null>(null);

  // Derive the drawer agent from the live snapshot so stats update in real-time.
  // Previously, the agent was captured once at click-time and never refreshed,
  // causing session stats (tokens, turns) to appear frozen.
  const drawerAgent = useMemo(() => {
    if (!drawerIssueId || !snapshot) return null;
    const entry = snapshot.running.find(([id]) => id === drawerIssueId);
    return entry ? entry[1] : null;
  }, [drawerIssueId, snapshot]);

  const openDrawerForAgent = (agent: RunningAgent) => {
    setDrawerIssueId(agent.issueId);
  };

  const openDrawerForSession = (issueId: string) => {
    setDrawerIssueId(issueId);
  };

  const closeDrawer = () => {
    setDrawerIssueId(null);
  };

  if (!snapshot) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Agent Monitor</h1>
        <p className="text-sm text-gray-500">
          {connected ? 'Waiting for first state update...' : 'Connecting to orchestrator...'}
        </p>
        <RecentSessions onViewStream={openDrawerForSession} />
        <AgentStreamDrawer agent={null} issueId={drawerIssueId} blocks={[]} onClose={closeDrawer} />
      </div>
    );
  }

  const agents = snapshot.running.map(([, entry]) => entry);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agent Monitor</h1>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={[
              'inline-block h-2 w-2 rounded-full',
              connected ? 'bg-emerald-500' : 'bg-yellow-400',
            ].join(' ')}
          />
          <span className={connected ? 'text-gray-500' : 'text-yellow-400'}>
            {connected ? 'Live' : 'Reconnecting...'}
          </span>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <RateLimitsCard snapshot={snapshot} />
        <ConcurrencyCard snapshot={snapshot} />
        <TokenUsageCard snapshot={snapshot} />
      </div>

      {snapshot.tickActivity && <PipelineActivity activity={snapshot.tickActivity} />}

      <section>
        <SectionHeader title="Active Agents" />
        <AgentsList agents={agents} agentEvents={agentEvents} onViewStream={openDrawerForAgent} />
      </section>

      <RetryQueue snapshot={snapshot} />

      <RecentSessions onViewStream={openDrawerForSession} />

      <AgentStreamDrawer
        agent={drawerAgent}
        issueId={drawerIssueId}
        blocks={drawerAgent ? (agentEvents[drawerAgent.issueId] ?? []) : []}
        onClose={closeDrawer}
      />
    </div>
  );
}
