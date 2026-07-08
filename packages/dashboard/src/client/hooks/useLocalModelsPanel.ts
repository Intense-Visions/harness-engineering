import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelProposalRecord } from '@harness-engineering/types';
import type { WebSocketMessage } from '../types/orchestrator';
import type {
  DashHardwareProfile,
  DashPoolStateView,
  DashRankedModel,
} from '../types/local-models';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

const HARDWARE_URL = '/api/v1/local-models/hardware';
const POOL_URL = '/api/v1/local-models/pool';
const RECOMMENDATIONS_URL = '/api/v1/local-models/recommendations';
const PROPOSALS_URL = '/api/v1/local-models/proposals';

/** A single fetched endpoint's state. `error === 'LMLM disabled'` means the GET returned 503. */
export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export interface UseLocalModelsPanelResult {
  hardware: Resource<DashHardwareProfile>;
  pool: Resource<DashPoolStateView>;
  recommendations: Resource<DashRankedModel[]>;
  proposals: Resource<ModelProposalRecord[]>;
  /** True when all four GETs returned 503 (LMLM disabled) — drives the single-banner state (Truth 8). */
  allDisabled: boolean;
  /** Re-issue all four GETs. Used by card action handlers after an approve/reject. */
  refetchAll: () => void;
}

const INITIAL = <T>(): Resource<T> => ({ data: null, error: null, loading: true });

function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

/**
 * Data hook for the `/s/local-models` panel (LMLM Phase 8).
 *
 * Seeds `hardware`, `pool`, `recommendations`, and `proposals` from the four
 * Phase 7 read GETs, then owns a `/ws` WebSocket. Per D-P8-3, the two
 * `local-models:*` frames are DELTA signals, not full state — the hook
 * REFETCHES on receipt rather than merging:
 *   - `local-models:pool`     → refetch pool + recommendations
 *   - `local-models:proposal` → refetch proposals + recommendations
 *
 * Per D-P8-4 each endpoint degrades independently: a `503` sets that resource's
 * `error: 'LMLM disabled'` and leaves the others populated. `allDisabled` is
 * true only when all four are disabled.
 *
 * **Standalone use only** — owns its own WebSocket. Mount exactly once per tree
 * (do not also mount `useLocalModelStatuses` alongside it).
 */
export function useLocalModelsPanel(): UseLocalModelsPanelResult {
  const [hardware, setHardware] = useState<Resource<DashHardwareProfile>>(INITIAL);
  const [pool, setPool] = useState<Resource<DashPoolStateView>>(INITIAL);
  const [recommendations, setRecommendations] = useState<Resource<DashRankedModel[]>>(INITIAL);
  const [proposals, setProposals] = useState<Resource<ModelProposalRecord[]>>(INITIAL);

  const mountedRef = useRef(true);
  const controllersRef = useRef<Set<AbortController>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);

  const fetchResource = useCallback(
    async <T>(url: string, setter: (r: Resource<T>) => void): Promise<void> => {
      const controller = new AbortController();
      controllersRef.current.add(controller);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!mountedRef.current) return;
        if (res.status === 503) {
          setter({ data: null, error: 'LMLM disabled', loading: false });
          return;
        }
        if (!res.ok) {
          setter({ data: null, error: `HTTP ${res.status}`, loading: false });
          return;
        }
        const json = (await res.json()) as T;
        if (!mountedRef.current) return;
        setter({ data: json, error: null, loading: false });
      } catch (err) {
        if (controller.signal.aborted || !mountedRef.current) return;
        setter({
          data: null,
          error: err instanceof Error ? err.message : 'Network error',
          loading: false,
        });
      } finally {
        controllersRef.current.delete(controller);
      }
    },
    []
  );

  const fetchHardware = useCallback(
    () => fetchResource<DashHardwareProfile>(HARDWARE_URL, setHardware),
    [fetchResource]
  );
  const fetchPool = useCallback(
    () => fetchResource<DashPoolStateView>(POOL_URL, setPool),
    [fetchResource]
  );
  const fetchRecommendations = useCallback(
    () => fetchResource<DashRankedModel[]>(RECOMMENDATIONS_URL, setRecommendations),
    [fetchResource]
  );
  const fetchProposals = useCallback(
    () => fetchResource<ModelProposalRecord[]>(PROPOSALS_URL, setProposals),
    [fetchResource]
  );

  const refetchAll = useCallback(() => {
    void fetchHardware();
    void fetchPool();
    void fetchRecommendations();
    void fetchProposals();
  }, [fetchHardware, fetchPool, fetchRecommendations, fetchProposals]);

  // Initial seed on mount.
  useEffect(() => {
    mountedRef.current = true;
    refetchAll();
    return () => {
      mountedRef.current = false;
      for (const c of controllersRef.current) c.abort();
      controllersRef.current.clear();
    };
  }, [refetchAll]);

  // WebSocket subscription: refetch on delta signals (D-P8-3).
  useEffect(() => {
    function connect(): void {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) reconnectAttempt.current = 0;
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (!mountedRef.current) return;
        try {
          // harness-ignore SEC-DES-001: client-side WebSocket consumer; trust boundary is the server, shape gated by typeof+`type` check below
          const raw: unknown = JSON.parse(event.data);
          if (typeof raw !== 'object' || raw === null || !('type' in raw)) return;
          const msg = raw as WebSocketMessage;
          if (msg.type === 'local-models:pool') {
            void fetchPool();
            void fetchRecommendations();
          } else if (msg.type === 'local-models:proposal') {
            void fetchProposals();
            void fetchRecommendations();
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
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
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [fetchPool, fetchRecommendations, fetchProposals]);

  const allDisabled =
    hardware.error === 'LMLM disabled' &&
    pool.error === 'LMLM disabled' &&
    recommendations.error === 'LMLM disabled' &&
    proposals.error === 'LMLM disabled';

  return { hardware, pool, recommendations, proposals, allDisabled, refetchAll };
}
