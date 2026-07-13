import { useThreadStore } from '../../stores/threadStore';
import type { PendingInteraction } from '../../types/orchestrator';

/** True when the interaction matches the (already-lowercased) search query. */
function matchesQuery(interaction: PendingInteraction, query: string): boolean {
  const matchesTitle = interaction.context.issueTitle?.toLowerCase().includes(query);
  const matchesDescription = interaction.context.issueDescription?.toLowerCase().includes(query);
  const matchesReasons = interaction.reasons.some((r) => r.toLowerCase().includes(query));
  const matchesId =
    interaction.id.toLowerCase().includes(query) ||
    interaction.issueId.toLowerCase().includes(query);
  return Boolean(matchesTitle || matchesDescription || matchesReasons || matchesId);
}

/**
 * Drops resolved interactions, applies the free-text search filter, and sorts
 * newest-first. Kept out of the component body so the page function stays flat.
 */
export function filterAndSortInteractions(
  interactions: PendingInteraction[],
  searchQuery: string
): PendingInteraction[] {
  const trimmed = searchQuery.trim();
  const query = trimmed.toLowerCase();
  const filtered = interactions.filter((i) => {
    if (i.status === 'resolved') return false;
    if (!trimmed) return true;
    return matchesQuery(i, query);
  });
  return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Finds the existing attention thread for an interaction id, if any. */
export function findAttentionThreadId(interactionId: string): string | undefined {
  const store = useThreadStore.getState();
  for (const thread of store.threads.values()) {
    if (
      thread.type === 'attention' &&
      'interactionId' in thread.meta &&
      thread.meta.interactionId === interactionId
    ) {
      return thread.id;
    }
  }
  return undefined;
}
