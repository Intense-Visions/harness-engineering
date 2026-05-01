import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLocalModelStatus } from '../../../src/client/hooks/useLocalModelStatus';
import type { LocalModelStatus } from '../../../src/client/types/orchestrator';

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

const STATUS_UNHEALTHY: LocalModelStatus = {
  available: false,
  resolved: null,
  configured: ['gemma-4-e4b'],
  detected: [],
  lastProbeAt: '2026-04-30T12:00:00.000Z',
  lastError: 'fetch failed',
  warnings: ['No configured candidate is loaded.'],
};

const STATUS_HEALTHY: LocalModelStatus = {
  ...STATUS_UNHEALTHY,
  available: true,
  resolved: 'gemma-4-e4b',
  detected: ['gemma-4-e4b'],
  lastError: null,
  warnings: [],
};

beforeEach(() => {
  FakeWebSocket.instance = null;
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useLocalModelStatus', () => {
  it('seeds initial status from HTTP GET when WebSocket has not delivered yet (OT8)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => STATUS_UNHEALTHY,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelStatus());

    await waitFor(() => {
      expect(result.current.status).toEqual(STATUS_UNHEALTHY);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/local-model/status',
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  it('returns null status and clears loading when HTTP returns 503 (no local backend)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Local backend not configured' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelStatus());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.status).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('replaces HTTP-fallback value with the WebSocket-delivered value (OT7)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => STATUS_UNHEALTHY,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelStatus());

    await waitFor(() => {
      expect(result.current.status?.available).toBe(false);
    });

    // Simulate a WebSocket flip to healthy.
    await waitFor(() => expect(FakeWebSocket.instance).not.toBeNull());
    act(() => {
      FakeWebSocket.instance!.simulateMessage({
        type: 'local-model:status',
        data: STATUS_HEALTHY,
      });
    });

    await waitFor(() => {
      expect(result.current.status?.available).toBe(true);
      expect(result.current.status?.resolved).toBe('gemma-4-e4b');
    });
  });

  it('ignores WebSocket messages of other types', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => STATUS_UNHEALTHY,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelStatus());
    await waitFor(() => expect(result.current.status?.available).toBe(false));
    await waitFor(() => expect(FakeWebSocket.instance).not.toBeNull());

    act(() => {
      FakeWebSocket.instance!.simulateMessage({ type: 'state_change', data: { running: [] } });
    });

    expect(result.current.status?.available).toBe(false); // unchanged
  });

  it('surfaces fetch errors via the error field', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLocalModelStatus());

    await waitFor(() => {
      expect(result.current.error).toBe('Network down');
      expect(result.current.loading).toBe(false);
    });
  });
});
