import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  OrchestratorSnapshot,
  PendingInteraction,
  AgentEventMessage,
  WebSocketMessage,
} from '../types/orchestrator';
import type { ContentBlock } from '../types/chat';
import { applyAgentEvent } from '../utils/agent-events';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/** Max content blocks retained per agent to bound memory. */
const MAX_BLOCKS_PER_AGENT = 500;

export interface OrchestratorSocketState {
  snapshot: OrchestratorSnapshot | null;
  interactions: PendingInteraction[];
  /** Accumulated content blocks per agent issueId. */
  agentEvents: Record<string, ContentBlock[]>;
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

function coalesceAgentEvent(
  prev: Record<string, ContentBlock[]>,
  data: AgentEventMessage
): Record<string, ContentBlock[]> {
  const { issueId, event } = data;
  if (!issueId || !event) return prev;

  const blocks = [...(prev[issueId] ?? [])];
  applyAgentEvent(blocks, event);
  const trimmed =
    blocks.length > MAX_BLOCKS_PER_AGENT
      ? blocks.slice(blocks.length - MAX_BLOCKS_PER_AGENT)
      : blocks;
  return { ...prev, [issueId]: trimmed };
}

function pruneStaleAgents(
  prev: Record<string, ContentBlock[]>,
  runningIds: Set<string>
): Record<string, ContentBlock[]> {
  const staleIds = Object.keys(prev).filter((id) => !runningIds.has(id));
  if (staleIds.length === 0) return prev;
  const next = { ...prev };
  for (const id of staleIds) delete next[id];
  return next;
}

function addInteraction(
  prev: PendingInteraction[],
  interaction: PendingInteraction
): PendingInteraction[] {
  if (prev.some((i) => i.id === interaction.id)) return prev;
  return [...prev, interaction];
}

function handleMessage(
  msg: WebSocketMessage,
  setSnapshot: (s: OrchestratorSnapshot) => void,
  setInteractions: React.Dispatch<React.SetStateAction<PendingInteraction[]>>,
  setAgentEvents: React.Dispatch<React.SetStateAction<Record<string, ContentBlock[]>>>
): void {
  switch (msg.type) {
    case 'state_change':
      setSnapshot(msg.data);
      break;
    case 'interaction_new':
      setInteractions((prev) => addInteraction(prev, msg.data));
      break;
    case 'agent_event':
      setAgentEvents((prev) => coalesceAgentEvent(prev, msg.data));
      break;
  }
}

function createSocket(
  mounted: { current: boolean },
  reconnectTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  attempt: { current: number },
  setConnected: (v: boolean) => void,
  setSnapshot: (s: OrchestratorSnapshot) => void,
  setInteractions: React.Dispatch<React.SetStateAction<PendingInteraction[]>>,
  setAgentEvents: React.Dispatch<React.SetStateAction<Record<string, ContentBlock[]>>>
): WebSocket {
  const ws = new WebSocket(getWsUrl());

  ws.onopen = () => {
    if (mounted.current) {
      attempt.current = 0;
      setConnected(true);
    }
  };

  ws.onmessage = (event: MessageEvent<string>) => {
    if (!mounted.current) return;
    try {
      const raw: unknown = JSON.parse(event.data);
      if (typeof raw !== 'object' || raw === null || !('type' in raw)) return;
      const msg = raw as WebSocketMessage;
      handleMessage(msg, setSnapshot, setInteractions, setAgentEvents);
    } catch {
      // ignore malformed messages
    }
  };

  ws.onclose = () => {
    if (!mounted.current) return;
    setConnected(false);
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt.current, RECONNECT_MAX_MS);
    attempt.current += 1;
    reconnectTimer.current = setTimeout(
      () =>
        createSocket(
          mounted,
          reconnectTimer,
          attempt,
          setConnected,
          setSnapshot,
          setInteractions,
          setAgentEvents
        ),
      delay
    );
  };

  ws.onerror = () => {
    // onclose fires after onerror, so reconnect is handled there
  };

  return ws;
}

/**
 * Manages a WebSocket connection to the orchestrator server.
 * Exposes real-time state snapshots and interaction notifications.
 * Automatically reconnects on disconnect.
 */
export function useOrchestratorSocket(): OrchestratorSocketState {
  const [snapshot, setSnapshot] = useState<OrchestratorSnapshot | null>(null);
  const [interactions, setInteractions] = useState<PendingInteraction[]>([]);
  const [agentEvents, setAgentEvents] = useState<Record<string, ContentBlock[]>>({});
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);

  const removeInteraction = useCallback((id: string) => {
    setInteractions((prev) => prev.filter((i) => i.id !== id));
  }, []);

  useEffect(() => {
    const mounted = { current: true };
    const ws = createSocket(
      mounted,
      reconnectTimer,
      reconnectAttempt,
      setConnected,
      setSnapshot,
      setInteractions,
      setAgentEvents
    );

    return () => {
      mounted.current = false;
      ws.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    const runningIds = new Set(snapshot.running.map(([id]) => id));
    setAgentEvents((prev) => pruneStaleAgents(prev, runningIds));
  }, [snapshot]);

  return { snapshot, interactions, agentEvents, connected, removeInteraction, setInteractions };
}
