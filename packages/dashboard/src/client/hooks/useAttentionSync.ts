import { useEffect, useRef } from 'react';
import { useThreadStore } from '../stores/threadStore';
import type { AttentionMeta } from '../types/thread';
import type { PendingInteraction } from '../types/orchestrator';
import type { OrchestratorSocketState } from './useOrchestratorSocket';

function hasThreadForInteraction(interactionId: string): boolean {
  const threads = useThreadStore.getState().threads;
  for (const thread of threads.values()) {
    if (
      thread.type === 'attention' &&
      (thread.meta as AttentionMeta).interactionId === interactionId
    ) {
      return true;
    }
  }
  return false;
}

function createAttentionThread(interaction: PendingInteraction): void {
  useThreadStore.getState().createThread('attention', {
    interactionId: interaction.id,
    issueId: interaction.issueId,
    reasons: interaction.reasons,
    context: interaction.context,
  });
}

/**
 * Syncs WebSocket escalation events with the ThreadStore.
 */
export function useAttentionSync(socket: OrchestratorSocketState) {
  const seenIds = useRef(new Set<string>());
  const initialFetchDone = useRef(false);

  // Fetch existing interactions on mount
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;

    fetch('/api/interactions')
      .then((res) => (res.ok ? res.json() : []))
      .then((interactions: PendingInteraction[]) => {
        for (const interaction of interactions) {
          if (interaction.status === 'resolved') continue;
          if (seenIds.current.has(interaction.id)) continue;
          seenIds.current.add(interaction.id);
          if (!hasThreadForInteraction(interaction.id)) {
            createAttentionThread(interaction);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Watch for new WebSocket interactions
  useEffect(() => {
    for (const interaction of socket.interactions) {
      if (seenIds.current.has(interaction.id)) continue;
      seenIds.current.add(interaction.id);
      createAttentionThread(interaction);
    }
  }, [socket.interactions]);
}
