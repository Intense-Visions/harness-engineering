import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { ModelProposalRecord } from '@harness-engineering/types';
import type { WebSocketMessage } from '../types/orchestrator';
import type {
  DashHardwareProfile,
  DashPoolStateView,
  DashRankedModel,
} from '../types/local-models';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Trailing-edge window (ms) for coalescing WS-delta refetches. A burst of
 * `local-models:{pool,proposal}` frames arriving within this window collapses
 * into a single refetch per affected resource, bounding the request storm and
 * narrowing the same-resource overlap window (pairs with the generation guard).
 */
const DELTA_REFETCH_DEBOUNCE_MS = 50;

/** Resources that WS delta frames can request a refetch of. */
type DeltaResource = 'pool' | 'recommendations' | 'proposals';

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

/**
 * In-flight (or just-failed) state of one operator install, keyed by `hfRepoId`
 * and driven by `local-models:install` WS frames. A `complete` frame REMOVES the
 * entry (the row flips to "installed" off the pool refetch); an `error` frame
 * keeps it so the row can surface the failure until dismissed.
 */
export interface InstallProgressState {
  phase: 'started' | 'progress' | 'error';
  completedBytes?: number;
  totalBytes?: number;
  message?: string;
  code?: string;
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
  /** Live install progress/error keyed by `hfRepoId` (from `local-models:install` WS frames). */
  installProgress: Record<string, InstallProgressState>;
  /** Clear a settled `error` entry so the row's failure message dismisses. */
  dismissInstall: (hfRepoId: string) => void;
}

const INITIAL = <T>(): Resource<T> => ({ data: null, error: null, loading: true });

function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

/** Narrow a raw WS payload to a typed {@link WebSocketMessage}, or null if malformed. */
function parseWsMessage(data: string): WebSocketMessage | null {
  try {
    // harness-ignore SEC-DES-001: client-side WebSocket consumer; trust boundary is the server, shape gated by typeof+`type` check below
    const raw: unknown = JSON.parse(data);
    if (typeof raw !== 'object' || raw === null || !('type' in raw)) return null;
    return raw as WebSocketMessage;
  } catch {
    return null;
  }
}

type InstallFrameData = Extract<WebSocketMessage, { type: 'local-models:install' }>['data'];

/**
 * Build the retained progress entry for a non-`complete` install frame (byte/error
 * updates). Only ever called after the caller has ruled out `phase === 'complete'`,
 * so `phase` is one of {@link InstallProgressState}'s three retained phases.
 */
function buildInstallEntry(ev: InstallFrameData): InstallProgressState {
  return {
    phase: ev.phase as InstallProgressState['phase'],
    ...(ev.completedBytes !== undefined ? { completedBytes: ev.completedBytes } : {}),
    ...(ev.totalBytes !== undefined ? { totalBytes: ev.totalBytes } : {}),
    ...(ev.message !== undefined ? { message: ev.message } : {}),
    ...(ev.code !== undefined ? { code: ev.code } : {}),
  };
}

/** Dependencies a WS install frame needs to update progress / trigger a refetch. */
interface InstallHandlers {
  dismissInstall: (hfRepoId: string) => void;
  scheduleRefetch: (resources: readonly DeltaResource[]) => void;
  setInstallProgress: (
    updater: (prev: Record<string, InstallProgressState>) => Record<string, InstallProgressState>
  ) => void;
}

/** Apply a `local-models:install` frame: complete → dismiss+refetch, else retain progress. */
function handleInstallFrame(ev: InstallFrameData, h: InstallHandlers): void {
  if (ev.phase === 'complete') {
    // Pool now holds the model; drop the progress row and refetch so it renders
    // as "installed" (the paired `local-models:pool` frame coalesces into one).
    h.dismissInstall(ev.hfRepoId);
    h.scheduleRefetch(['pool', 'recommendations']);
    return;
  }
  // 'started' | 'progress' (byte updates) or 'error' (retained until dismissed).
  const entry = buildInstallEntry(ev);
  h.setInstallProgress((prev) => ({ ...prev, [ev.hfRepoId]: entry }));
}

/** Route a decoded WS message to a delta refetch or an install-frame handler. */
function routeWsMessage(msg: WebSocketMessage, h: InstallHandlers): void {
  if (msg.type === 'local-models:pool') {
    h.scheduleRefetch(['pool', 'recommendations']);
  } else if (msg.type === 'local-models:proposal') {
    h.scheduleRefetch(['proposals', 'recommendations']);
  } else if (msg.type === 'local-models:install') {
    handleInstallFrame(msg.data, h);
  }
}

const LMLM_DISABLED = 'LMLM disabled';

/** True only when all four resources returned the LMLM-disabled sentinel (Truth 8). */
function computeAllDisabled(
  hardware: Resource<DashHardwareProfile>,
  pool: Resource<DashPoolStateView>,
  recommendations: Resource<DashRankedModel[]>,
  proposals: Resource<ModelProposalRecord[]>
): boolean {
  return [hardware, pool, recommendations, proposals].every((r) => r.error === LMLM_DISABLED);
}

/** Refs shared with {@link fetchResourceInto} for mount-safety and per-resource sequencing. */
interface FetchCtx {
  mountedRef: MutableRefObject<boolean>;
  controllersRef: MutableRefObject<Set<AbortController>>;
  /** Per-URL request counter — only the latest generation is allowed to commit. */
  generationsRef: MutableRefObject<Map<string, number>>;
  /** Per-URL in-flight controller — aborted before a newer fetch for the same URL starts. */
  activeControllersRef: MutableRefObject<Map<string, AbortController>>;
}

/**
 * Fetch a single resource into `setter`, guaranteeing **last-REQUEST-wins**:
 * overlapping fetches of the same URL bump a per-resource generation, the prior
 * in-flight request is aborted, and a response only commits while it is still
 * both mounted and the latest generation. This prevents a slow older response
 * from clobbering fresher data (the approve/WS-delta refetch race).
 */
async function fetchResourceInto<T>(
  url: string,
  setter: (r: Resource<T>) => void,
  ctx: FetchCtx
): Promise<void> {
  const gen = (ctx.generationsRef.current.get(url) ?? 0) + 1;
  ctx.generationsRef.current.set(url, gen);
  ctx.activeControllersRef.current.get(url)?.abort();

  const controller = new AbortController();
  ctx.controllersRef.current.add(controller);
  ctx.activeControllersRef.current.set(url, controller);
  const isCurrent = (): boolean =>
    ctx.mountedRef.current && ctx.generationsRef.current.get(url) === gen;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!isCurrent()) return;
    if (res.status === 503) {
      setter({ data: null, error: 'LMLM disabled', loading: false });
      return;
    }
    if (!res.ok) {
      setter({ data: null, error: `HTTP ${res.status}`, loading: false });
      return;
    }
    const json = (await res.json()) as T;
    if (!isCurrent()) return;
    setter({ data: json, error: null, loading: false });
  } catch (err) {
    if (controller.signal.aborted || !isCurrent()) return;
    setter({
      data: null,
      error: err instanceof Error ? err.message : 'Network error',
      loading: false,
    });
  } finally {
    ctx.controllersRef.current.delete(controller);
    if (ctx.activeControllersRef.current.get(url) === controller) {
      ctx.activeControllersRef.current.delete(url);
    }
  }
}

/**
 * Returns a `scheduleRefetch(resources)` that coalesces WS-delta refetches: the
 * requested resources are queued and drained by a single trailing-edge flush
 * ({@link DELTA_REFETCH_DEBOUNCE_MS}). Frames arriving before the flush fires
 * add to the pending set without arming a second timer, so a burst collapses to
 * one refetch per resource instead of one GET pair per frame. The flush reads
 * the latest fetchers via a ref, so the returned callback is stable and the
 * pending timer is cleared on unmount.
 */
function useCoalescedRefetch(
  fetchers: Record<DeltaResource, () => Promise<void>>
): (resources: readonly DeltaResource[]) => void {
  const pendingRef = useRef<Set<DeltaResource>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchersRef = useRef(fetchers);
  fetchersRef.current = fetchers;

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return useCallback((resources: readonly DeltaResource[]): void => {
    for (const r of resources) pendingRef.current.add(r);
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const due = pendingRef.current;
      pendingRef.current = new Set();
      for (const r of due) void fetchersRef.current[r]();
    }, DELTA_REFETCH_DEBOUNCE_MS);
  }, []);
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
  const [installProgress, setInstallProgress] = useState<Record<string, InstallProgressState>>({});

  const mountedRef = useRef(true);
  const controllersRef = useRef<Set<AbortController>>(new Set());
  // Per-resource (keyed by URL) request sequence + in-flight controller so that
  // overlapping refetches of the SAME resource are last-REQUEST-wins, not
  // last-RESPONSE-wins: a slow older response can no longer clobber fresh data.
  const generationsRef = useRef<Map<string, number>>(new Map());
  const activeControllersRef = useRef<Map<string, AbortController>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);

  const fetchResource = useCallback(
    <T>(url: string, setter: (r: Resource<T>) => void): Promise<void> =>
      fetchResourceInto(url, setter, {
        mountedRef,
        controllersRef,
        generationsRef,
        activeControllersRef,
      }),
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

  const dismissInstall = useCallback((hfRepoId: string) => {
    setInstallProgress((prev) => {
      if (!(hfRepoId in prev)) return prev;
      const next = { ...prev };
      delete next[hfRepoId];
      return next;
    });
  }, []);

  // Coalesce delta-driven refetches so a burst of WS frames collapses into a
  // single refetch per affected resource (see useCoalescedRefetch).
  const scheduleRefetch = useCoalescedRefetch({
    pool: fetchPool,
    recommendations: fetchRecommendations,
    proposals: fetchProposals,
  });

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
    const handlers: InstallHandlers = { dismissInstall, scheduleRefetch, setInstallProgress };

    function connect(): void {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) reconnectAttempt.current = 0;
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (!mountedRef.current) return;
        const msg = parseWsMessage(event.data);
        if (msg) routeWsMessage(msg, handlers);
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
  }, [scheduleRefetch, dismissInstall]);

  const allDisabled = computeAllDisabled(hardware, pool, recommendations, proposals);

  return {
    hardware,
    pool,
    recommendations,
    proposals,
    allDisabled,
    refetchAll,
    installProgress,
    dismissInstall,
  };
}
