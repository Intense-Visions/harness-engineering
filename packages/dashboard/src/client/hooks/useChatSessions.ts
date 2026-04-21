import { useState, useEffect, useCallback } from 'react';
import type { ChatSession } from '../types/chat-session';

const ACTIVE_SESSION_KEY = 'active-chat-session';

function persistSession(session: ChatSession): void {
  fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  }).catch((err) => console.error('Failed to persist session update:', err));
}

function patchSessionOnServer(id: string, data: Partial<ChatSession>): void {
  fetch(`/api/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch((err) => console.error('Failed to patch session update:', err));
}

function applyUpdate(prev: ChatSession[], id: string, data: Partial<ChatSession>): ChatSession[] {
  const updated = prev.map((s) => (s.sessionId === id ? { ...s, ...data } : s));
  const session = updated.find((s) => s.sessionId === id);
  if (session) persistSession(session);
  return updated;
}

function readActiveSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_SESSION_KEY);
}

function syncActiveSessionToStorage(id: string | null): void {
  if (id) {
    localStorage.setItem(ACTIVE_SESSION_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
}

function fetchSessions(
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>
): () => void {
  let mounted = true;
  fetch('/api/sessions')
    .then((res) => (res.ok ? res.json() : []))
    .then((data) => {
      if (mounted) setSessions(data);
    })
    .catch((err) => console.error('Failed to fetch chat sessions:', err));
  return () => {
    mounted = false;
  };
}

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(readActiveSessionId);

  useEffect(() => syncActiveSessionToStorage(activeSessionId), [activeSessionId]);
  useEffect(() => fetchSessions(setSessions), []);

  const updateSession = useCallback(
    (
      id: string,
      dataOrFn: Partial<ChatSession> | ((session: ChatSession) => Partial<ChatSession>)
    ) => {
      setSessions((prev) => {
        const data =
          typeof dataOrFn === 'function'
            ? dataOrFn(prev.find((s) => s.sessionId === id) ?? ({} as ChatSession))
            : dataOrFn;
        return applyUpdate(prev, id, data);
      });
    },
    []
  );

  const patchSession = useCallback(async (id: string, data: Partial<ChatSession>) => {
    setSessions((prev) => prev.map((s) => (s.sessionId === id ? { ...s, ...data } : s)));
    patchSessionOnServer(id, data);
  }, []);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    updateSession,
    patchSession,
    setSessions,
  };
}
