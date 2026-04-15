import { useState, useEffect, useCallback } from 'react';
import { useChatSessions } from './useChatSessions';
import type { ChatSession } from '../types/chat-session';

const STORAGE_KEY = 'chat-panel-open';

function readInitialOpen(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

function buildNewSession(params: {
  command?: string;
  label?: string;
  interactionId?: string;
}): ChatSession {
  const sessionId = crypto.randomUUID();
  const defaultLabel = params.command
    ? params.command.split(':').pop() || 'New Session'
    : 'New Session';

  return {
    sessionId,
    command: params.command || null,
    interactionId: params.interactionId || null,
    label: params.label || defaultLabel,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    artifacts: [],
    status: 'active',
    messages: [],
    input: '',
  };
}

function persistNewSession(session: ChatSession): void {
  fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  }).catch((err) => console.error('Failed to persist new session:', err));
}

function deleteSessionOnServer(id: string): void {
  fetch(`/api/sessions/${id}`, { method: 'DELETE' }).catch((err) =>
    console.error('Failed to delete session on server:', err)
  );
}

type SetSessions = React.Dispatch<React.SetStateAction<ChatSession[]>>;
type SetActiveId = (id: string | null) => void;

function removeSession(
  prev: ChatSession[],
  id: string,
  activeId: string | null,
  setActive: SetActiveId
): ChatSession[] {
  const remaining = prev.filter((s) => s.sessionId !== id);
  if (activeId === id) setActive(remaining[0]?.sessionId ?? null);
  return remaining;
}

function addSession(
  setSessions: SetSessions,
  setActiveId: SetActiveId,
  setOpen: (v: boolean) => void,
  params: { command?: string; label?: string; interactionId?: string }
): string {
  const s = buildNewSession(params);
  setSessions((prev) => [...prev, s]);
  setActiveId(s.sessionId);
  setOpen(true);
  persistNewSession(s);
  return s.sessionId;
}

export function useChatPanel() {
  const [isOpen, setIsOpen] = useState<boolean>(readInitialOpen);
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    updateSession,
    patchSession,
    setSessions,
  } = useChatSessions();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isOpen));
  }, [isOpen]);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const renameSession = useCallback(
    (id: string, label: string) => patchSession(id, { label }),
    [patchSession]
  );
  const createNewSession = useCallback(
    (params: { command?: string; label?: string; interactionId?: string } = {}) =>
      addSession(setSessions, setActiveSessionId, setIsOpen, params),
    [setSessions, setActiveSessionId]
  );
  const closeSession = useCallback(
    (id: string) => {
      setSessions((prev) => removeSession(prev, id, activeSessionId, setActiveSessionId));
      deleteSessionOnServer(id);
    },
    [activeSessionId, setActiveSessionId, setSessions]
  );

  return {
    isOpen,
    toggle,
    open,
    close,
    sessions,
    activeSessionId,
    setActiveSessionId,
    updateSession,
    patchSession,
    createNewSession,
    closeSession,
    renameSession,
  };
}
