import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router';
import { useOrchestratorSocket } from '../hooks/useOrchestratorSocket';
import { useNotifications } from '../hooks/useNotifications';
import type { PendingInteraction } from '../types/orchestrator';

function InteractionCard({
  interaction,
  onDismiss,
}: {
  interaction: PendingInteraction;
  onDismiss: (id: string) => void;
}) {
  const { context, reasons, status, createdAt } = interaction;
  const isPending = status === 'pending';
  const isClaimed = status === 'claimed';

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">{context.issueTitle}</h3>
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
        <ul className="space-y-1">
          {reasons.map((reason, i) => (
            <li key={i} className="text-sm text-yellow-400">
              {reason}
            </li>
          ))}
        </ul>
      </div>

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
          <Link
            to={`/orchestrator/chat?interactionId=${interaction.id}`}
            className="rounded bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
          >
            Claim
          </Link>
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

  // Fire browser notifications for new escalations
  useNotifications(allInteractions);

  // Fetch initial interactions from API
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/interactions');
        if (res.ok) {
          const data = (await res.json()) as PendingInteraction[];
          setInteractions(data);
          setAllInteractions(data);
        }
      } finally {
        setLoaded(true);
      }
    })();
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
      await fetch(`/api/interactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      removeInteraction(id);
      setAllInteractions((prev) => prev.filter((i) => i.id !== id));
    },
    [removeInteraction]
  );

  // Show non-resolved interactions, sorted newest first
  const visible = allInteractions
    .filter((i) => i.status !== 'resolved')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Needs Attention</h1>

      {!loaded && <p className="text-sm text-gray-500">Loading interactions...</p>}

      {loaded && visible.length === 0 && (
        <p className="text-sm text-gray-500">No interactions require attention.</p>
      )}

      <div className="space-y-4">
        {visible.map((interaction) => (
          <InteractionCard
            key={interaction.id}
            interaction={interaction}
            onDismiss={(id) => void handleDismiss(id)}
          />
        ))}
      </div>
    </div>
  );
}
