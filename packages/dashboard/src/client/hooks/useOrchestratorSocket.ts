import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  OrchestratorSnapshot,
  PendingInteraction,
  WebSocketMessage,
} from '../types/orchestrator';

const RECONNECT_DELAY_MS = 3_000;

export interface OrchestratorSocketState {
  snapshot: OrchestratorSnapshot | null;
  interactions: PendingInteraction[];
  connected: boolean;
  /** Manually remove an interaction (after claim/resolve). */
  removeInteraction: (id: string) => void;
  /** Replace interactions list (after fetch from API). */
  setInteractions: (interactions: PendingInteraction[]) => void;
}

function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

/**
 * Manages a WebSocket connection to the orchestrator server.
 * Exposes real-time state snapshots and interaction notifications.
 * Automatically reconnects on disconnect.
 */
export function useOrchestratorSocket(): OrchestratorSocketState {
  const [snapshot, setSnapshot] = useState<OrchestratorSnapshot | null>(null);
  const [interactions, setInteractions] = useState<PendingInteraction[]>([]);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const removeInteraction = useCallback((id: string) => {
    setInteractions((prev) => prev.filter((i) => i.id !== id));
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let mounted = true;

    function connect() {
      ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        if (!mounted) return;
        setConnected(true);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (!mounted) return;
        try {
          const msg = JSON.parse(event.data) as WebSocketMessage;
          switch (msg.type) {
            case 'state_change':
              setSnapshot(msg.data);
              break;
            case 'interaction_new':
              setInteractions((prev) => {
                if (prev.some((i) => i.id === msg.data.id)) return prev;
                return [...prev, msg.data];
              });
              break;
            case 'agent_event':
              // Agent events consumed by individual agent detail views (future)
              break;
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mounted) return;
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      ws.onerror = () => {
        // onclose fires after onerror, so reconnect is handled there
      };
    }

    connect();

    return () => {
      mounted = false;
      ws?.close();
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, []);

  return { snapshot, interactions, connected, removeInteraction, setInteractions };
}
