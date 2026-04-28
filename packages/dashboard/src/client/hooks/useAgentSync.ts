import { useEffect, useRef } from 'react';
import { useThreadStore } from '../stores/threadStore';
import type { AgentMeta } from '../types/thread';
import type { RunningAgent } from '../types/orchestrator';
import type { OrchestratorSocketState } from './useOrchestratorSocket';

function findAgentThread(issueId: string) {
  for (const thread of useThreadStore.getState().threads.values()) {
    if (thread.type === 'agent' && (thread.meta as AgentMeta).issueId === issueId) {
      return thread;
    }
  }
  return null;
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
 */
export function useAgentSync(socket: OrchestratorSocketState) {
  const knownAgents = useRef(new Set<string>());

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
