import { useEffect, useState, useCallback } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSearchParams } from 'react-router';
import { useOrchestratorSocket } from '../hooks/useOrchestratorSocket';
import { useNotifications } from '../hooks/useNotifications';
import { useChatPanel } from '../hooks/useChatPanel';
import { Search, X, Loader2 } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import type {
  PendingInteraction,
  InteractionEnrichedSpec,
  InteractionComplexityScore,
} from '../types/orchestrator';

function EnrichedSpecPanel({ spec }: { spec: InteractionEnrichedSpec }) {
  return (
    <div className="space-y-3 rounded-md border border-primary-500/20 bg-primary-500/5 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-widest text-primary-500">
        Enriched Spec (SEL)
      </h4>
      <div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Intent
        </span>
        <p className="mt-1 text-sm text-white">{spec.intent}</p>
      </div>
      <div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Summary
        </span>
        <p className="mt-1 text-sm leading-relaxed text-gray-300">{spec.summary}</p>
      </div>
      {spec.affectedSystems.length > 0 && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Affected Systems
          </span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {spec.affectedSystems.map((sys) => (
              <span
                key={sys.name}
                className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400"
                title={`Confidence: ${Math.round(sys.confidence * 100)}% | Tests: ${sys.testCoverage} | Deps: ${sys.transitiveDeps.length}`}
              >
                {sys.name}
                {sys.graphNodeId && (
                  <span className="ml-1 text-blue-500/50">{Math.round(sys.confidence * 100)}%</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {spec.unknowns.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">
              Unknowns ({spec.unknowns.length})
            </span>
            <ul className="mt-1 space-y-0.5">
              {spec.unknowns.map((u, i) => (
                <li key={i} className="text-xs text-gray-400">
                  {u}
                </li>
              ))}
            </ul>
          </div>
        )}
        {spec.ambiguities.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-orange-500">
              Ambiguities ({spec.ambiguities.length})
            </span>
            <ul className="mt-1 space-y-0.5">
              {spec.ambiguities.map((a, i) => (
                <li key={i} className="text-xs text-gray-400">
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}
        {spec.riskSignals.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">
              Risk Signals ({spec.riskSignals.length})
            </span>
            <ul className="mt-1 space-y-0.5">
              {spec.riskSignals.map((r, i) => (
                <li key={i} className="text-xs text-gray-400">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

const RISK_COLORS: Record<string, string> = {
  low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const ROUTE_COLORS: Record<string, string> = {
  local: 'text-emerald-400',
  human: 'text-amber-400',
  'simulation-required': 'text-purple-400',
};

function ScoreBar({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className={color}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-800">
        <div
          className={`h-full rounded-full ${color.replace('text-', 'bg-')}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ComplexityScorePanel({ score }: { score: InteractionComplexityScore }) {
  return (
    <div className="space-y-3 rounded-md border border-secondary-400/20 bg-secondary-400/5 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-secondary-400">
          Complexity Model (CML)
        </h4>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${RISK_COLORS[score.riskLevel] ?? RISK_COLORS.medium}`}
          >
            {score.riskLevel}
          </span>
          <span
            className={`text-xs font-mono font-bold ${ROUTE_COLORS[score.recommendedRoute] ?? 'text-gray-400'}`}
          >
            {score.recommendedRoute}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        <ScoreBar value={score.overall} label="Overall" color="text-primary-500" />
        <ScoreBar value={score.dimensions.structural} label="Structural" color="text-blue-400" />
        <ScoreBar value={score.dimensions.semantic} label="Semantic" color="text-purple-400" />
        <ScoreBar value={score.dimensions.historical} label="Historical" color="text-yellow-400" />
        <ScoreBar value={score.confidence} label="Confidence" color="text-emerald-400" />
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-gray-800 pt-2 md:grid-cols-4">
        <div className="text-center">
          <span className="block text-lg font-bold text-white">{score.blastRadius.services}</span>
          <span className="text-[10px] uppercase tracking-widest text-gray-500">Services</span>
        </div>
        <div className="text-center">
          <span className="block text-lg font-bold text-white">{score.blastRadius.modules}</span>
          <span className="text-[10px] uppercase tracking-widest text-gray-500">Modules</span>
        </div>
        <div className="text-center">
          <span className="block text-lg font-bold text-white">
            {score.blastRadius.filesEstimated}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-gray-500">Files</span>
        </div>
        <div className="text-center">
          <span className="block text-lg font-bold text-white">
            {score.blastRadius.testFilesAffected}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-gray-500">Test Files</span>
        </div>
      </div>
      {score.reasoning.length > 0 && (
        <div className="border-t border-gray-800 pt-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Reasoning
          </span>
          <ul className="mt-1 space-y-0.5">
            {score.reasoning.map((r, i) => (
              <li key={i} className="text-xs text-gray-400">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InteractionCard({
  interaction,
  onDismiss,
  onClaim,
}: {
  interaction: PendingInteraction;
  onDismiss: (id: string) => void;
  onClaim: (id: string) => void;
}) {
  const { context, reasons, status, createdAt } = interaction;
  const isPending = status === 'pending';
  const isClaimed = status === 'claimed';
  const hasSpec = !!context.enrichedSpec;
  const hasScore = !!context.complexityScore;
  const hasAnalysis = hasSpec || hasScore;
  const [specExpanded, setSpecExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">{context.issueTitle}</h3>
            {hasAnalysis && (
              <span className="rounded-md border border-primary-500/20 bg-primary-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary-500">
                Analyzed
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {new Date(createdAt).toLocaleString()} · {interaction.issueId}
          </p>
        </div>
        <span
          className={[
            'rounded px-2 py-0.5 text-xs font-medium',
            isPending ? 'bg-yellow-900 text-yellow-300' : '',
            isClaimed ? 'bg-blue-900 text-blue-300' : '',
            status === 'resolved' ? 'bg-gray-700 text-gray-400' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {status}
        </span>
      </div>

      {context.issueDescription && (
        <p className="mb-3 text-sm text-gray-300">{context.issueDescription}</p>
      )}

      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-gray-500">
          Escalation Reasons
        </p>
        <div className="space-y-1">
          {reasons.map((reason, i) => (
            <div
              key={i}
              className="text-sm text-yellow-400 [&_p]:m-0 [&_strong]:font-bold [&_strong]:text-yellow-200"
            >
              <Markdown remarkPlugins={[remarkGfm]}>{reason}</Markdown>
            </div>
          ))}
        </div>
      </div>

      {hasAnalysis && (
        <div className="mb-3">
          <button
            onClick={() => setSpecExpanded((prev) => !prev)}
            className={[
              'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs transition-colors',
              specExpanded
                ? 'border-primary-500/30 bg-primary-500/10'
                : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800',
            ].join(' ')}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block text-[10px] text-gray-500 transition-transform"
                style={{ transform: specExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >
                &#9654;
              </span>
              <span className="font-medium text-gray-300">
                {specExpanded ? 'Hide' : 'View'} Analysis
              </span>
              {hasSpec && (
                <span className="text-gray-500">
                  {context.enrichedSpec!.affectedSystems.length} system
                  {context.enrichedSpec!.affectedSystems.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {hasScore && (
              <span
                className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${RISK_COLORS[context.complexityScore!.riskLevel] ?? RISK_COLORS.medium}`}
              >
                {context.complexityScore!.riskLevel} risk
              </span>
            )}
          </button>
          {specExpanded && (
            <div className="mt-2 space-y-3">
              {hasSpec && <EnrichedSpecPanel spec={context.enrichedSpec!} />}
              {hasScore && <ComplexityScorePanel score={context.complexityScore!} />}
            </div>
          )}
        </div>
      )}

      {context.relatedFiles.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-widest text-gray-500">
            Related Files
          </p>
          <ul className="space-y-0.5">
            {context.relatedFiles.map((file) => (
              <li key={file} className="font-mono text-xs text-gray-400">
                {file}
              </li>
            ))}
          </ul>
        </div>
      )}

      {context.specPath && (
        <p className="mb-3 text-xs text-gray-500">
          Spec: <span className="font-mono text-gray-400">{context.specPath}</span>
        </p>
      )}

      {(isPending || isClaimed) && (
        <div className="flex gap-2">
          <button
            onClick={() => onClaim(interaction.id)}
            className="rounded bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
          >
            Claim
          </button>
          <button
            onClick={() => onDismiss(interaction.id)}
            className="rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-600"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export function Attention() {
  const {
    interactions: wsInteractions,
    removeInteraction,
    setInteractions,
  } = useOrchestratorSocket();
  const [loaded, setLoaded] = useState(false);
  const [allInteractions, setAllInteractions] = useState<PendingInteraction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [, setSearchParams] = useSearchParams();
  const { open: openChat } = useChatPanel();

  // Fire browser notifications for new escalations
  useNotifications(allInteractions);

  // Fetch initial interactions from API
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/interactions', { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as PendingInteraction[];
          setInteractions(data);
          setAllInteractions(data);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      } finally {
        setLoaded(true);
      }
    })();
    return () => controller.abort();
  }, [setInteractions]);

  // Merge WebSocket interactions into local state
  useEffect(() => {
    if (wsInteractions.length > 0) {
      setAllInteractions((prev) => {
        const ids = new Set(prev.map((i) => i.id));
        const newOnes = wsInteractions.filter((i) => !ids.has(i.id));
        return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
      });
    }
  }, [wsInteractions]);

  const handleDismiss = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/interactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      if (!res.ok) return;
      removeInteraction(id);
      setAllInteractions((prev) => prev.filter((i) => i.id !== id));
    },
    [removeInteraction]
  );

  const handleClaim = useCallback(
    (id: string) => {
      setSearchParams({ interactionId: id });
      openChat();
    },
    [openChat, setSearchParams]
  );

  // Filter and sort interactions
  const filtered = allInteractions.filter((i) => {
    if (i.status === 'resolved') return false;
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    const matchesTitle = i.context.issueTitle?.toLowerCase().includes(query);
    const matchesDescription = i.context.issueDescription?.toLowerCase().includes(query);
    const matchesReasons = i.reasons.some((r) => r.toLowerCase().includes(query));
    const matchesId = i.id.toLowerCase().includes(query) || i.issueId.toLowerCase().includes(query);

    return matchesTitle || matchesDescription || matchesReasons || matchesId;
  });

  const visible = filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Needs Attention</h1>
        <div className="relative w-full max-w-sm">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-gray-500" />
          </div>
          <input
            type="text"
            className="block w-full rounded-lg border border-gray-800 bg-gray-900 py-2 pl-10 pr-10 text-sm text-white placeholder-gray-500 transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="Search escalations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-300"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!loaded && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Loading interactions...</p>
          </div>
        </div>
      )}

      {loaded && visible.length === 0 && (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-800 bg-gray-900/20 p-12 text-center">
          <div>
            <p className="text-sm text-gray-500">
              {searchQuery
                ? 'No interactions match your search.'
                : 'No interactions require attention.'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs font-semibold text-primary-500 hover:text-primary-400"
              >
                Clear search
              </button>
            )}
          </div>
        </div>
      )}

      {loaded && visible.length > 0 && (
        <div className="flex-1 overflow-hidden">
          <Virtuoso
            style={{ height: '100%' }}
            data={visible}
            itemContent={(_index, interaction) => (
              <div className="pb-4 pr-4">
                <InteractionCard
                  interaction={interaction}
                  onDismiss={(id) => void handleDismiss(id)}
                  onClaim={handleClaim}
                />
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
