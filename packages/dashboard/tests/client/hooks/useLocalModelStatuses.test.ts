import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLocalModelStatuses } from '../../../src/client/hooks/useLocalModelStatuses';
import type { NamedLocalModelStatus } from '../../../src/client/types/orchestrator';

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

const STATUS_LOCAL_UNHEALTHY: NamedLocalModelStatus = {
  available: false,
  resolved: null,
  configured: ['gemma-4-e4b'],
  detected: [],
  lastProbeAt: '2026-04-30T12:00:00.000Z',
  lastError: 'fetch failed',
  warnings: ['No configured candidate is loaded.'],
  backendName: 'local',
  endpoint: 'http://localhost:1234/v1',
};

const STATUS_LOCAL_HEALTHY: NamedLocalModelStatus = {
  ...STATUS_LOCAL_UNHEALTHY,
  available: true,
  resolved: 'gemma-4-e4b',
  detected: ['gemma-4-e4b'],
  lastError: null,
  warnings: [],
};

const STATUS_PI2_UNHEALTHY: NamedLocalModelStatus = {
  ...STATUS_LOCAL_UNHEALTHY,
  backendName: 'pi-2',
  endpoint: 'http://192.168.1.50:1234/v1',
};

beforeEach(() => {
  FakeWebSocket.instance = null;
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useLocalModelStatuses', () => {
  it('seeds initial statuses[] from HTTP GET when WebSocket has not delivered yet (SC38)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [STATUS_LOCAL_UNHEALTHY],
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelStatuses());

    await waitFor(() => {
      expect(result.current.statuses).toEqual([STATUS_LOCAL_UNHEALTHY]);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/local-models/status',
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  it('returns empty statuses[] and clears loading when HTTP returns 200 + [] (no local backends)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelStatuses());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.statuses).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('replaces HTTP-fallback value with the WebSocket-delivered value (merge-by-backendName SC39)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [STATUS_LOCAL_UNHEALTHY],
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelStatuses());

    await waitFor(() => {
      expect(result.current.statuses[0]?.available).toBe(false);
    });

    // Simulate a WebSocket flip to healthy for the same backend.
    await waitFor(() => expect(FakeWebSocket.instance).not.toBeNull());
    act(() => {
      FakeWebSocket.instance!.simulateMessage({
        type: 'local-model:status',
        data: STATUS_LOCAL_HEALTHY,
      });
    });

    await waitFor(() => {
      expect(result.current.statuses).toHaveLength(1);
      expect(result.current.statuses[0]?.available).toBe(true);
      expect(result.current.statuses[0]?.resolved).toBe('gemma-4-e4b');
    });
  });

  it('appends a new backend on first event for that backendName (merge-by-backendName SC39)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [STATUS_LOCAL_UNHEALTHY],
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelStatuses());

    await waitFor(() => expect(result.current.statuses).toHaveLength(1));
    await waitFor(() => expect(FakeWebSocket.instance).not.toBeNull());

    act(() => {
      FakeWebSocket.instance!.simulateMessage({
        type: 'local-model:status',
        data: STATUS_PI2_UNHEALTHY,
      });
    });

    await waitFor(() => expect(result.current.statuses).toHaveLength(2));
    const byName = new Map(result.current.statuses.map((s) => [s.backendName, s]));
    expect(byName.has('local')).toBe(true);
    expect(byName.has('pi-2')).toBe(true);
  });

  it('ignores WebSocket messages of other types', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [STATUS_LOCAL_UNHEALTHY],
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelStatuses());
    await waitFor(() => expect(result.current.statuses[0]?.available).toBe(false));
    await waitFor(() => expect(FakeWebSocket.instance).not.toBeNull());

    act(() => {
      FakeWebSocket.instance!.simulateMessage({ type: 'state_change', data: { running: [] } });
    });

    expect(result.current.statuses[0]?.available).toBe(false); // unchanged
    expect(result.current.statuses).toHaveLength(1);
  });

  it('surfaces fetch errors via the error field', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelStatuses());

    await waitFor(() => {
      expect(result.current.error).toBe('Network down');
      expect(result.current.loading).toBe(false);
    });
  });

  it('HTTP fallback arriving after a WebSocket message merges by name and does not stomp WS state (P4-S1)', async () => {
    // Hold the fetch promise open so the WebSocket can deliver first.
    let resolveFetch: (value: unknown) => void = () => {};
    const fetchPromise = new Promise<unknown>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelStatuses());

    // Fire a WS message first — populates statuses with backend `local`.
    await waitFor(() => expect(FakeWebSocket.instance).not.toBeNull());
    act(() => {
      FakeWebSocket.instance!.simulateMessage({
        type: 'local-model:status',
        data: STATUS_LOCAL_HEALTHY,
      });
    });

    await waitFor(() => {
      expect(result.current.statuses).toHaveLength(1);
      expect(result.current.statuses[0]?.available).toBe(true);
    });

    // Now resolve the HTTP fallback with [local-unhealthy, pi-2]: a per-name
    // merge must (a) keep the WS-fresh `local` (available=true) and
    // (b) append `pi-2` from HTTP. Pre-fix behaviour stomped to the
    // HTTP payload because prev.length !== 0.
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => [STATUS_LOCAL_UNHEALTHY, STATUS_PI2_UNHEALTHY],
    });

    await waitFor(() => {
      expect(result.current.statuses).toHaveLength(2);
    });
    const byName = new Map(result.current.statuses.map((s) => [s.backendName, s]));
    expect(byName.get('local')?.available).toBe(true); // WS-fresh value preserved
    expect(byName.get('pi-2')?.available).toBe(false); // HTTP-seeded new entry appended
    expect(result.current.loading).toBe(false);
  });
});
