import { useEffect, useRef, useState } from 'react';
import type { NamedLocalModelStatus, WebSocketMessage } from '../types/orchestrator';
import {
  mergeLocalModelStatusByName,
  mergeLocalModelStatusesFromHttp,
} from '../utils/local-model-statuses';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export interface UseLocalModelStatusesResult {
  /**
   * Per-backend local-model statuses, merged by `backendName`. Empty array
   * until the first HTTP fallback resolves OR the first WebSocket event
   * arrives. Spec 2 SC38–SC39: the multi-local replacement for the singular
   * `useLocalModelStatus()` hook (renamed in Phase 5).
   */
  statuses: NamedLocalModelStatus[];
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
 * Subscribe to the orchestrator's `local-model:status` WebSocket topic
 * and seed from the multi-status HTTP endpoint.
 *
 * On mount, issues a single GET to /api/v1/local-models/status to seed the
 * initial value, then opens a WebSocket on /ws and listens for status
 * events. WebSocket-delivered values supersede HTTP fallback values for
 * matching `backendName`s; events for new names append to the array.
 *
 * **Standalone use only.** This hook owns its own WebSocket connection. If
 * a parent component already calls `useOrchestratorSocket()`, prefer reading
 * `localModelStatuses` from that hook's return value instead — calling both
 * hooks in the same render tree opens two WebSocket connections. This hook
 * exists for components that need the statuses without a full orchestrator
 * snapshot (e.g., a future minimal dashboard widget).
 */
export function useLocalModelStatuses(): UseLocalModelStatusesResult {
  const [statuses, setStatuses] = useState<NamedLocalModelStatus[]>([]);
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
        const res = await fetch('/api/v1/local-models/status', { signal: controller.signal });
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        const json = (await res.json()) as NamedLocalModelStatus[];
        // Per-name merge: HTTP-seeded entries append for backendNames the WS
        // hasn't delivered yet; entries already populated by the WS keep
        // their (fresher) value. Closes Spec 2 P4-S1 — the prior
        // `prev.length === 0 ? json : prev` guard could stomp WS state when
        // the HTTP fallback resolved after a partial WS delivery.
        setStatuses((prev) => mergeLocalModelStatusesFromHttp(prev, json));
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
            // Merge-by-backendName: upsert in place; preserve other entries.
            setStatuses((prev) => mergeLocalModelStatusByName(prev, msg.data));
            setLoading(false);
            // Clear any stale HTTP fallback error — a fresh WebSocket message
            // proves the backend is reachable, even if the initial GET failed.
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

  return { statuses, loading, error };
}
