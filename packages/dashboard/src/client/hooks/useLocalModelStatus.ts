import { useEffect, useRef, useState } from 'react';
import type { LocalModelStatus, WebSocketMessage } from '../types/orchestrator';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export interface UseLocalModelStatusResult {
  /** Latest LocalModelStatus snapshot, or null when not yet loaded. */
  status: LocalModelStatus | null;
  /** True until the first HTTP fallback resolves OR the first WebSocket event arrives. */
  loading: boolean;
  /** HTTP fallback error message, null when healthy. WebSocket errors do not surface here (the hook auto-reconnects). */
  error: string | null;
}

function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

/**
 * Subscribe to the orchestrator's `local-model:status` WebSocket topic.
 *
 * On mount, issues a single GET to /api/v1/local-model/status to seed the
 * initial value, then opens a WebSocket on /ws and listens for status
 * events. WebSocket-delivered values always supersede the HTTP fallback.
 *
 * **Standalone use only.** This hook owns its own WebSocket connection. If
 * a parent component already calls `useOrchestratorSocket()`, prefer reading
 * `localModelStatus` from that hook's return value instead — calling both
 * hooks in the same render tree opens two WebSocket connections. This hook
 * exists for components that need the status without a full orchestrator
 * snapshot (e.g., a future minimal dashboard widget).
 */
export function useLocalModelStatus(): UseLocalModelStatusResult {
  const [status, setStatus] = useState<LocalModelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);

  // HTTP fallback for initial load.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/v1/local-model/status', { signal: controller.signal });
        if (res.status === 503) {
          // No local backend configured — leave status as null; banner will not render.
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        const json = (await res.json()) as LocalModelStatus;
        // Only seed if the WebSocket hasn't already populated state.
        setStatus((prev) => prev ?? json);
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Network error');
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  // WebSocket subscription.
  useEffect(() => {
    const mounted = { current: true };

    function connect(): void {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (mounted.current) reconnectAttempt.current = 0;
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (!mounted.current) return;
        try {
          const raw: unknown = JSON.parse(event.data);
          if (typeof raw !== 'object' || raw === null || !('type' in raw)) return;
          const msg = raw as WebSocketMessage;
          if (msg.type === 'local-model:status') {
            setStatus(msg.data);
            setLoading(false);
            // Clear any stale HTTP fallback error — a fresh WebSocket message
            // proves the backend is reachable, even if the initial GET 503'd.
            setError(null);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mounted.current) return;
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt.current, RECONNECT_MAX_MS);
        reconnectAttempt.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose fires after onerror; reconnect handled there.
      };
    }

    connect();

    return () => {
      mounted.current = false;
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  return { status, loading, error };
}
