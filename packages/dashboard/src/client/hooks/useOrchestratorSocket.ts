import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  OrchestratorSnapshot,
  PendingInteraction,
  AgentEventMessage,
  WebSocketMessage,
  MaintenanceEvent,
  LocalModelStatus,
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
  /** Most recent maintenance event received via WebSocket. */
  maintenanceEvent: MaintenanceEvent | null;
  /** Latest LocalModelStatus snapshot delivered via local-model:status, or null until first event. */
  localModelStatus: LocalModelStatus | null;
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

interface MessageHandlers {
  setSnapshot: (s: OrchestratorSnapshot) => void;
  setInteractions: React.Dispatch<React.SetStateAction<PendingInteraction[]>>;
  setAgentEvents: React.Dispatch<React.SetStateAction<Record<string, ContentBlock[]>>>;
  setMaintenanceEvent: React.Dispatch<React.SetStateAction<MaintenanceEvent | null>>;
  setLocalModelStatus: React.Dispatch<React.SetStateAction<LocalModelStatus | null>>;
}

function handleMessage(msg: WebSocketMessage, handlers: MessageHandlers): void {
  switch (msg.type) {
    case 'state_change':
      handlers.setSnapshot(msg.data);
      break;
    case 'interaction_new':
      handlers.setInteractions((prev) => addInteraction(prev, msg.data));
      break;
    case 'agent_event':
      handlers.setAgentEvents((prev) => coalesceAgentEvent(prev, msg.data));
      break;
    case 'maintenance:started':
      handlers.setMaintenanceEvent({ type: 'maintenance:started', data: msg.data });
      break;
    case 'maintenance:error':
      handlers.setMaintenanceEvent({ type: 'maintenance:error', data: msg.data });
      break;
    case 'maintenance:completed':
      handlers.setMaintenanceEvent({ type: 'maintenance:completed', data: msg.data });
      break;
    case 'local-model:status':
      handlers.setLocalModelStatus(msg.data);
      break;
  }
}

function createSocket(
  mounted: { current: boolean },
  reconnectTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  attempt: { current: number },
  setConnected: (v: boolean) => void,
  handlers: MessageHandlers
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
      handleMessage(msg, handlers);
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
      () => createSocket(mounted, reconnectTimer, attempt, setConnected, handlers),
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
  const [maintenanceEvent, setMaintenanceEvent] = useState<MaintenanceEvent | null>(null);
  const [localModelStatus, setLocalModelStatus] = useState<LocalModelStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);

  const removeInteraction = useCallback((id: string) => {
    setInteractions((prev) => prev.filter((i) => i.id !== id));
  }, []);

  useEffect(() => {
    const mounted = { current: true };
    const handlers: MessageHandlers = {
      setSnapshot,
      setInteractions,
      setAgentEvents,
      setMaintenanceEvent,
      setLocalModelStatus,
    };
    const ws = createSocket(mounted, reconnectTimer, reconnectAttempt, setConnected, handlers);

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

  return {
    snapshot,
    interactions,
    agentEvents,
    maintenanceEvent,
    localModelStatus,
    connected,
    removeInteraction,
    setInteractions,
  };
}
