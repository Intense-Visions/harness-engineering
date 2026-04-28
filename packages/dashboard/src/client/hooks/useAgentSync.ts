import { useEffect, useRef } from 'react';
import { useThreadStore } from '../stores/threadStore';
import type { AgentMeta } from '../types/thread';
import type { RunningAgent } from '../types/orchestrator';
import type { StreamManifest } from './useStreamReplay';
import type { OrchestratorSocketState } from './useOrchestratorSocket';

function findAgentThread(issueId: string) {
  for (const thread of useThreadStore.getState().threads.values()) {
    if (thread.type === 'agent' && (thread.meta as AgentMeta).issueId === issueId) {
      return thread;
    }
  }
  return null;
}

/**
 * Seed the threadStore with historical completed sessions from /api/streams
 * so that agents which finished before the dashboard opened appear in Recent.
 */
async function seedHistoricalSessions(): Promise<void> {
  try {
    const res = await fetch('/api/streams');
    if (!res.ok) return;
    const sessions = (await res.json()) as StreamManifest[];
    const store = useThreadStore.getState();

    for (const session of sessions) {
      if (findAgentThread(session.issueId)) continue;

      const lastAttempt = session.attempts.at(-1);
      const isRunning = lastAttempt && !lastAttempt.endedAt;
      // Only seed completed sessions — running ones will be picked up by live sync
      if (isRunning) continue;

      const thread = store.createThread('agent', {
        issueId: session.issueId,
        identifier: session.identifier,
        phase: 'completed',
        issueTitle: session.title ?? session.identifier,
        issueDescription: null,
        startedAt: lastAttempt?.startedAt ?? new Date().toISOString(),
        backendName: null,
      } satisfies AgentMeta);

      store.updateThread(thread.id, { status: 'completed' });
    }
  } finally {
    useThreadStore.getState().markSourceHydrated();
  }
}

function syncRunningAgent(issueId: string, agent: RunningAgent, known: Set<string>): void {
  const store = useThreadStore.getState();
  const existing = findAgentThread(issueId);

  if (known.has(issueId)) {
    // Update phase and stats
    if (existing) {
      const currentMeta = existing.meta as AgentMeta;
      if (
        currentMeta.phase !== agent.phase ||
        currentMeta.backendName !== (agent.session?.backendName ?? null)
      ) {
        store.updateThread(existing.id, {
          meta: {
            ...currentMeta,
            phase: agent.phase,
            backendName: agent.session?.backendName ?? null,
          },
        });
      }
    }
    return;
  }

  known.add(issueId);
  if (!existing) {
    store.createThread('agent', {
      issueId,
      identifier: agent.identifier,
      phase: agent.phase,
      issueTitle: agent.issue.title,
      issueDescription: agent.issue.description,
      startedAt: agent.startedAt,
      backendName: agent.session?.backendName ?? null,
    });
  }
}

function markCompletedAgents(runningIds: Set<string>): void {
  const store = useThreadStore.getState();
  for (const thread of store.threads.values()) {
    if (thread.type === 'agent' && thread.status === 'active') {
      if (!runningIds.has((thread.meta as AgentMeta).issueId)) {
        store.updateThread(thread.id, { status: 'completed' });
      }
    }
  }
}

/**
 * Syncs orchestrator running agents with the ThreadStore.
 * On mount, seeds historical completed sessions from /api/streams.
 */
export function useAgentSync(socket: OrchestratorSocketState) {
  const knownAgents = useRef(new Set<string>());
  const seeded = useRef(false);

  // Seed historical sessions once on mount
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      void seedHistoricalSessions();
    }
  }, []);

  useEffect(() => {
    if (!socket.snapshot) return;

    const runningIds = new Set<string>();
    for (const [issueId, agent] of socket.snapshot.running) {
      runningIds.add(issueId);
      syncRunningAgent(issueId, agent, knownAgents.current);
    }

    markCompletedAgents(runningIds);
  }, [socket.snapshot]);
}
