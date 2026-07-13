import { useThreadStore } from '../../stores/threadStore';
import type { AgentMeta } from '../../types/thread';

/**
 * Returns the id of an existing `agent` thread for the given issue, or
 * `undefined` if none exists. Shared by the agent- and session-navigation
 * callbacks so the lookup loop lives in one place.
 */
export function findAgentThreadId(issueId: string): string | undefined {
  const store = useThreadStore.getState();
  for (const thread of store.threads.values()) {
    if (thread.type === 'agent' && (thread.meta as AgentMeta).issueId === issueId) {
      return thread.id;
    }
  }
  return undefined;
}
