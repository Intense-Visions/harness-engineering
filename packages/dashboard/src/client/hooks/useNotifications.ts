import { useEffect, useRef } from 'react';
import type { PendingInteraction } from '../types/orchestrator';

/**
 * Requests browser notification permission on mount.
 * Fires a Notification for each new interaction that arrives while the document is hidden.
 */
export function useNotifications(interactions: PendingInteraction[]): void {
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  // Request permission on mount
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  // Fire notifications for new interactions (skip initial set)
  useEffect(() => {
    // On first render, mark all current interactions as seen without notifying
    if (!initialized.current) {
      for (const i of interactions) {
        seenIds.current.add(i.id);
      }
      initialized.current = true;
      return;
    }

    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!document.hidden) return;

    for (const interaction of interactions) {
      if (seenIds.current.has(interaction.id)) continue;
      seenIds.current.add(interaction.id);

      new Notification('Needs Attention', {
        body: `${interaction.context.issueTitle}\n${interaction.reasons.join(', ')}`,
        tag: interaction.id,
      });
    }
  }, [interactions]);
}
