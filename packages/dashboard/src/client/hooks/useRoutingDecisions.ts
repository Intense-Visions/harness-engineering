import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { RoutingDecision } from '@harness-engineering/types';
import type { WebSocketMessage } from '../types/orchestrator';
import type { RoutingDecisionsResponse, RoutingWsStatus } from '../types/routing';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;
const BUFFER_LIMIT = 500;

export interface UseRoutingDecisionsResult {
  decisions: RoutingDecision[];
  status: RoutingWsStatus;
  error: string | null;
}

/**
 * Shared mutable handles threaded through the standalone stream helpers so
 * they can live at module scope instead of being re-created (and re-counted)
 * inside the hook body.
 */
interface RoutingStreamCtx {
  mounted: { current: boolean };
  wsRef: { current: WebSocket | null };
  pollTimer: { current: ReturnType<typeof setInterval> | null };
  reconnectTimer: { current: ReturnType<typeof setTimeout> | null };
  reconnectAttempt: { current: number };
  setDecisions: Dispatch<SetStateAction<RoutingDecision[]>>;
  setStatus: Dispatch<SetStateAction<RoutingWsStatus>>;
}

function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

async function fetchDecisions(signal?: AbortSignal): Promise<RoutingDecision[]> {
  const init: RequestInit = signal ? { signal } : {};
  const res = await fetch(`/api/v1/routing/decisions?limit=${BUFFER_LIMIT}`, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as RoutingDecisionsResponse;
  return json.decisions;
}

/** Parse a raw WS payload into a routing decision, or null when irrelevant/malformed. */
function parseRoutingDecision(data: string): RoutingDecision | null {
  try {
    // harness-ignore SEC-DES-001: client-side WebSocket consumer; trust boundary is the server, shape gated by typeof+`type` check on next line
    const raw: unknown = JSON.parse(data);
    if (typeof raw !== 'object' || raw === null || !('type' in raw)) return null;
    const msg = raw as WebSocketMessage;
    return msg.type === 'routing:decision' ? msg.data : null;
  } catch {
    return null;
  }
}

/** Prepend a decision and cap the buffer at BUFFER_LIMIT entries. */
function appendDecision(prev: RoutingDecision[], decision: RoutingDecision): RoutingDecision[] {
  const next = [decision, ...prev];
  return next.length > BUFFER_LIMIT ? next.slice(0, BUFFER_LIMIT) : next;
}

function startPolling(ctx: RoutingStreamCtx): void {
  if (ctx.pollTimer.current) return;
  ctx.pollTimer.current = setInterval(() => {
    fetchDecisions()
      .then((rows) => {
        if (ctx.mounted.current) ctx.setDecisions(rows);
      })
      .catch(() => {
        /* swallow — next tick retries */
      });
  }, POLL_INTERVAL_MS);
}

function stopPolling(ctx: RoutingStreamCtx): void {
  if (ctx.pollTimer.current) {
    clearInterval(ctx.pollTimer.current);
    ctx.pollTimer.current = null;
  }
}

function handleOpen(ctx: RoutingStreamCtx): void {
  if (!ctx.mounted.current) return;
  ctx.reconnectAttempt.current = 0;
  stopPolling(ctx);
  ctx.setStatus('live');
}

function handleMessage(ctx: RoutingStreamCtx, event: MessageEvent<string>): void {
  if (!ctx.mounted.current) return;
  const decision = parseRoutingDecision(event.data);
  if (decision) ctx.setDecisions((prev) => appendDecision(prev, decision));
}

function handleClose(ctx: RoutingStreamCtx): void {
  if (!ctx.mounted.current) return;
  ctx.setStatus('polling');
  startPolling(ctx);
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** ctx.reconnectAttempt.current, RECONNECT_MAX_MS);
  ctx.reconnectAttempt.current += 1;
  ctx.reconnectTimer.current = setTimeout(() => connect(ctx), delay);
}

function connect(ctx: RoutingStreamCtx): void {
  const ws = new WebSocket(getWsUrl());
  ctx.wsRef.current = ws;
  ws.onopen = () => handleOpen(ctx);
  ws.onmessage = (event: MessageEvent<string>) => handleMessage(ctx, event);
  ws.onclose = () => handleClose(ctx);
  ws.onerror = () => {
    /* onclose handles reconnect */
  };
}

/**
 * Spec B Phase 7 — subscribe to routing:decision WS topic with HTTP
 * seed + polling fallback. Standalone (owns its own socket); do not
 * mount in a parent that already opens /ws — see useLocalModelStatuses
 * JSDoc for the same constraint.
 */
export function useRoutingDecisions(): UseRoutingDecisionsResult {
  const [decisions, setDecisions] = useState<RoutingDecision[]>([]);
  const [status, setStatus] = useState<RoutingWsStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // HTTP seed on mount.
  useEffect(() => {
    const controller = new AbortController();
    fetchDecisions(controller.signal)
      .then((rows) => setDecisions(rows))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => controller.abort();
  }, []);

  // WS subscription + polling fallback.
  useEffect(() => {
    const mounted = { current: true };
    const ctx: RoutingStreamCtx = {
      mounted,
      wsRef,
      pollTimer,
      reconnectTimer,
      reconnectAttempt,
      setDecisions,
      setStatus,
    };
    connect(ctx);
    return () => {
      mounted.current = false;
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      stopPolling(ctx);
    };
  }, []);

  return { decisions, status, error };
}
