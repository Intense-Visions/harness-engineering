import { useEffect, useRef } from 'react';
import { useThreadStore } from '../stores/threadStore';
import type { ChatSession } from '../types/chat-session';

/**
 * Hydrates the thread store with chat sessions persisted on the server
 * (`.harness/sessions/<id>/session.json`).
 *
 * Without this, chat threads only exist in zustand's in-memory map, so any full
 * reload (refresh / tab reopen) loses every prior chat — even though the
 * messages are still on disk.
 */
export function useChatSessionsSync() {
  const initialFetchDone = useRef(false);

  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;

    fetch('/api/sessions')
      .then((res) => (res.ok ? res.json() : []))
      .then((sessions: ChatSession[]) => {
        if (!Array.isArray(sessions)) return;
        const store = useThreadStore.getState();
        for (const session of sessions) {
          if (!session?.sessionId) continue;
          if (store.threads.has(`chat:${session.sessionId}`)) continue;
          const thread = store.createThread('chat', {
            sessionId: session.sessionId,
            command: session.command ?? null,
          });
          if (session.label && session.label !== 'New Chat') {
            store.updateThread(thread.id, { title: session.label });
          }
          if (Array.isArray(session.messages) && session.messages.length > 0) {
            store.setMessages(thread.id, session.messages);
          }
        }
      })
      .catch(() => {})
      .finally(() => useThreadStore.getState().markSourceHydrated());
  }, []);
}
