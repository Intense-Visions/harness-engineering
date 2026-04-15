import { useState, useEffect, useCallback } from 'react';
import { useChatSessions } from './useChatSessions';
import type { ChatSession } from '../types/chat-session';

const STORAGE_KEY = 'chat-panel-open';

export function useChatPanel() {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'true';
  });

  const { 
    sessions, 
    activeSessionId, 
    setActiveSessionId, 
    updateSession,
    patchSession,
    setSessions
  } = useChatSessions();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isOpen));
  }, [isOpen]);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const renameSession = useCallback((id: string, label: string) => {
    patchSession(id, { label });
  }, [patchSession]);

  const createNewSession = useCallback((params: { command?: string; label?: string; interactionId?: string } = {}) => {
    const sessionId = crypto.randomUUID();
    const newSession: ChatSession = {
      sessionId,
      command: params.command || null,
      interactionId: params.interactionId || null,
      label: params.label || (params.command ? params.command.split(':').pop() || 'New Session' : 'New Session'),
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      artifacts: [],
      status: 'active',
      messages: [],
      input: '',
    };

    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(sessionId);
    setIsOpen(true);
    
    // Persist new session to server
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSession)
    }).catch(err => console.error('Failed to persist new session:', err));

    return sessionId;
  }, [setSessions, setActiveSessionId]);

  const closeSession = useCallback((id: string) => {
    setSessions(prev => {
      const remaining = prev.filter(s => s.sessionId !== id);
      if (activeSessionId === id) {
        setActiveSessionId(remaining.length > 0 ? remaining[0]!.sessionId : null);
      }
      return remaining;
    });
    
    // Persist deletion to server
    fetch(`/api/sessions/${id}`, {
      method: 'DELETE',
    }).catch(err => console.error('Failed to delete session on server:', err));
  }, [activeSessionId, setActiveSessionId, setSessions]);

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
    renameSession
  };
}
