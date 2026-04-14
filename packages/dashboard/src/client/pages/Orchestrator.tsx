import { useOrchestratorSocket } from '../hooks/useOrchestratorSocket';
import type { OrchestratorSnapshot, RunningAgent } from '../types/orchestrator';

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">{title}</h2>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString();
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

function AgentsTable({ agents }: { agents: RunningAgent[] }) {
  if (agents.length === 0) {
    return <p className="text-sm italic text-gray-500">No active agents.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-700 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2">Identifier</th>
            <th className="px-3 py-2">Backend</th>
            <th className="px-3 py-2">Phase</th>
            <th className="px-3 py-2">Tokens</th>
            <th className="px-3 py-2">Turns</th>
            <th className="px-3 py-2">Last Message</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <tr key={agent.issueId} className="border-b border-gray-800">
              <td className="max-w-[200px] truncate px-3 py-2 text-white">{agent.identifier}</td>
              <td className="px-3 py-2 text-blue-400">{agent.session?.backendName ?? '-'}</td>
              <td className="px-3 py-2 text-cyan-400">{agent.phase}</td>
              <td className="px-3 py-2 text-yellow-400">{agent.session?.totalTokens ?? 0}</td>
              <td className="px-3 py-2 text-gray-300">{agent.session?.turnCount ?? 0}</td>
              <td className="max-w-[300px] truncate px-3 py-2 text-gray-400">
                {agent.session?.lastMessage ?? '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Orchestrator() {
  const { snapshot, connected } = useOrchestratorSocket();

  if (!snapshot) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Agent Monitor</h1>
        <p className="text-sm text-gray-500">
          {connected ? 'Waiting for first state update...' : 'Connecting to orchestrator...'}
        </p>
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

      <section>
        <SectionHeader title="Active Agents" />
        <AgentsTable agents={agents} />
      </section>
    </div>
  );
}
