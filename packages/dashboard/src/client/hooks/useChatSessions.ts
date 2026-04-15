import { useState, useEffect, useCallback } from 'react';
import type { ChatSession } from '../types/chat-session';

const ACTIVE_SESSION_KEY = 'active-chat-session';

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  });

  // Persist active session ID to localStorage
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  }, [activeSessionId]);

  // Initial fetch from server
  useEffect(() => {
    let mounted = true;
    fetch('/api/sessions')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (mounted) setSessions(data);
      })
      .catch(err => {
        console.error('Failed to fetch chat sessions:', err);
      });
    return () => { mounted = false; };
  }, []);

  /** Update a session locally and on the server (full rewrite) */
  const updateSession = useCallback(async (id: string, data: Partial<ChatSession>) => {
    setSessions(prev => {
      const updated = prev.map(s => s.sessionId === id ? { ...s, ...data } : s);
      
      // Persist the specific updated session to the server
      const session = updated.find(s => s.sessionId === id);
      if (session) {
        fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(session)
        }).catch(err => console.error('Failed to persist session update:', err));
      }
      
      return updated;
    });
  }, []);

  /** Partial update session on the server via PATCH */
  const patchSession = useCallback(async (id: string, data: Partial<ChatSession>) => {
    setSessions(prev => prev.map(s => s.sessionId === id ? { ...s, ...data } : s));
    
    try {
      await fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (err) {
      console.error('Failed to patch session update:', err);
    }
  }, []);

  return { 
    sessions, 
    activeSessionId, 
    setActiveSessionId, 
    updateSession,
    patchSession,
    setSessions 
  };
}
