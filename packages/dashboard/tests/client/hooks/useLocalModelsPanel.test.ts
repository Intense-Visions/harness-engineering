import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLocalModelsPanel } from '../../../src/client/hooks/useLocalModelsPanel';
import type {
  DashHardwareProfile,
  DashPoolStateView,
} from '../../../src/client/types/local-models';

class FakeWebSocket {
  static instance: FakeWebSocket | null = null;
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  readyState = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instance = this;
    setTimeout(() => this.onopen?.(), 0);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const HARDWARE: DashHardwareProfile = {
  platform: 'macos',
  vramGb: 36,
  ramGb: 36,
  bandwidthGbps: 400,
  cpuName: 'Apple M3 Max',
  detectedAt: '2026-07-01T00:00:00.000Z',
};

const POOL: DashPoolStateView = {
  diskBudgetGb: 100,
  diskUsedGb: 18,
  entries: [
    {
      ollamaName: 'qwen3:32b',
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      sizeOnDiskGb: 18,
      installedAt: '2026-07-01T00:00:00.000Z',
      lastUsedAt: null,
      currentScore: 82,
    },
  ],
  allowedOrgs: ['Qwen'],
  allowedFamilies: [],
  lastRefreshAt: null,
};

function jsonRes(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/** Build a fetch spy that branches on the local-models GET URL. */
function branchingFetch(
  over: Partial<Record<'hardware' | 'pool' | 'recommendations' | 'proposals', () => Response>> = {}
) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/local-models/hardware'))
      return Promise.resolve((over.hardware ?? (() => jsonRes(HARDWARE)))());
    if (url.includes('/local-models/pool'))
      return Promise.resolve((over.pool ?? (() => jsonRes(POOL)))());
    if (url.includes('/local-models/recommendations'))
      return Promise.resolve((over.recommendations ?? (() => jsonRes([])))());
    if (url.includes('/local-models/proposals'))
      return Promise.resolve((over.proposals ?? (() => jsonRes([])))());
    return Promise.resolve(jsonRes({}, 200));
  });
}

function countCalls(fetchMock: ReturnType<typeof vi.fn>, fragment: string): number {
  return fetchMock.mock.calls.filter((c) => String(c[0]).includes(fragment)).length;
}

beforeEach(() => {
  FakeWebSocket.instance = null;
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useLocalModelsPanel', () => {
  it('seeds all four resources from four GETs on mount', async () => {
    const fetchMock = branchingFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelsPanel());

    await waitFor(() => {
      expect(result.current.hardware.data).toEqual(HARDWARE);
      expect(result.current.pool.data).toEqual(POOL);
      expect(result.current.recommendations.data).toEqual([]);
      expect(result.current.proposals.data).toEqual([]);
    });
    expect(countCalls(fetchMock, '/local-models/hardware')).toBe(1);
    expect(countCalls(fetchMock, '/local-models/pool')).toBe(1);
    expect(countCalls(fetchMock, '/local-models/recommendations')).toBe(1);
    expect(countCalls(fetchMock, '/local-models/proposals')).toBe(1);
  });

  it('degrades only the hardware card on a 503 (per-card degrade, D-P8-4)', async () => {
    const fetchMock = branchingFetch({ hardware: () => jsonRes({ error: 'LMLM disabled' }, 503) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelsPanel());

    await waitFor(() => {
      expect(result.current.hardware.error).toBe('LMLM disabled');
    });
    expect(result.current.hardware.data).toBeNull();
    expect(result.current.pool.data).toEqual(POOL);
    expect(result.current.recommendations.error).toBeNull();
    expect(result.current.allDisabled).toBe(false);
  });

  it('exposes allDisabled=true when all four GETs return 503', async () => {
    const all503 = () => jsonRes({ error: 'LMLM disabled' }, 503);
    const fetchMock = branchingFetch({
      hardware: all503,
      pool: all503,
      recommendations: all503,
      proposals: all503,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelsPanel());

    await waitFor(() => {
      expect(result.current.allDisabled).toBe(true);
    });
  });

  it('refetches pool + recommendations on a local-models:pool WS frame (not hardware)', async () => {
    const fetchMock = branchingFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelsPanel());
    await waitFor(() => expect(result.current.pool.data).toEqual(POOL));
    await waitFor(() => expect(FakeWebSocket.instance).not.toBeNull());

    const poolBefore = countCalls(fetchMock, '/local-models/pool');
    const recsBefore = countCalls(fetchMock, '/local-models/recommendations');
    const hwBefore = countCalls(fetchMock, '/local-models/hardware');

    act(() => {
      FakeWebSocket.instance!.simulateMessage({
        type: 'local-models:pool',
        data: { action: 'evict', phase: 'evict_completed' },
      });
    });

    await waitFor(() => {
      expect(countCalls(fetchMock, '/local-models/pool')).toBe(poolBefore + 1);
      expect(countCalls(fetchMock, '/local-models/recommendations')).toBe(recsBefore + 1);
    });
    expect(countCalls(fetchMock, '/local-models/hardware')).toBe(hwBefore);
  });

  it('refetches proposals + recommendations on a local-models:proposal WS frame', async () => {
    const fetchMock = branchingFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelsPanel());
    await waitFor(() => expect(result.current.proposals.data).toEqual([]));
    await waitFor(() => expect(FakeWebSocket.instance).not.toBeNull());

    const propsBefore = countCalls(fetchMock, '/local-models/proposals');
    const recsBefore = countCalls(fetchMock, '/local-models/recommendations');
    const poolBefore = countCalls(fetchMock, '/local-models/pool');

    act(() => {
      FakeWebSocket.instance!.simulateMessage({
        type: 'local-models:proposal',
        data: { id: 'p1', status: 'created' },
      });
    });

    await waitFor(() => {
      expect(countCalls(fetchMock, '/local-models/proposals')).toBe(propsBefore + 1);
      expect(countCalls(fetchMock, '/local-models/recommendations')).toBe(recsBefore + 1);
    });
    expect(countCalls(fetchMock, '/local-models/pool')).toBe(poolBefore);
  });

  it('refetchAll() re-issues all four GETs', async () => {
    const fetchMock = branchingFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelsPanel());
    await waitFor(() => expect(result.current.hardware.data).toEqual(HARDWARE));

    act(() => {
      result.current.refetchAll();
    });

    await waitFor(() => {
      expect(countCalls(fetchMock, '/local-models/hardware')).toBe(2);
      expect(countCalls(fetchMock, '/local-models/pool')).toBe(2);
      expect(countCalls(fetchMock, '/local-models/recommendations')).toBe(2);
      expect(countCalls(fetchMock, '/local-models/proposals')).toBe(2);
    });
  });

  it('ignores unrelated WS frames', async () => {
    const fetchMock = branchingFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelsPanel());
    await waitFor(() => expect(result.current.pool.data).toEqual(POOL));
    await waitFor(() => expect(FakeWebSocket.instance).not.toBeNull());

    const poolBefore = countCalls(fetchMock, '/local-models/pool');
    act(() => {
      FakeWebSocket.instance!.simulateMessage({ type: 'state_change', data: { running: [] } });
    });
    expect(countCalls(fetchMock, '/local-models/pool')).toBe(poolBefore);
  });

  it('closes the socket on unmount', async () => {
    const fetchMock = branchingFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderHook(() => useLocalModelsPanel());
    await waitFor(() => expect(FakeWebSocket.instance).not.toBeNull());
    const ws = FakeWebSocket.instance!;
    unmount();
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
  });
});
