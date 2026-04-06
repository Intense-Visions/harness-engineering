import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSSE } from '../../../src/client/hooks/useSSE';
import type { SSEEvent } from '../../../src/shared/types';

// --- Minimal EventSource mock ---

type Listener = (e: Event) => void;

class FakeEventSource {
  static instance: FakeEventSource | null = null;

  url: string;
  onerror: ((e: Event) => void) | null = null;
  private listeners: Map<string, Listener[]> = new Map();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instance = this;
  }

  addEventListener(type: string, fn: Listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  close() {
    // no-op for tests
  }

  emit(type: string, data: unknown) {
    const event = Object.assign(new Event(type), {
      data: JSON.stringify(data),
    }) as MessageEvent;
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }
}

beforeEach(() => {
  FakeEventSource.instance = null;
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function makeOverviewEvent(): SSEEvent & { type: 'overview' } {
  return {
    type: 'overview',
    timestamp: new Date().toISOString(),
    data: {
      roadmap: { error: 'skipped' },
      health: { error: 'skipped' },
      graph: { available: false, reason: 'skipped' },
    },
  };
}

describe('useSSE', () => {
  it('starts with null data', () => {
    const { result } = renderHook(() => useSSE('/api/sse', 'overview'));
    expect(result.current.data).toBeNull();
    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('opens an EventSource at the given URL', () => {
    renderHook(() => useSSE('/api/sse', 'overview'));
    expect(FakeEventSource.instance?.url).toBe('/api/sse');
  });

  it('updates data when the named event fires', () => {
    const { result } = renderHook(() => useSSE('/api/sse', 'overview'));
    const event = makeOverviewEvent();

    act(() => {
      FakeEventSource.instance?.emit('overview', event);
    });

    expect(result.current.data).toEqual(event.data);
    expect(result.current.lastUpdated).toBe(event.timestamp);
    expect(result.current.stale).toBe(false);
  });

  it('sets stale=true and error message on connection error', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSSE('/api/sse', 'overview'));

    act(() => {
      FakeEventSource.instance?.emit('overview', makeOverviewEvent());
    });

    act(() => {
      FakeEventSource.instance?.simulateError();
    });

    expect(result.current.stale).toBe(true);
    expect(result.current.error).toMatch(/Connection lost/);
    expect(result.current.data).not.toBeNull();
  });

  it('schedules a reconnect after error', () => {
    vi.useFakeTimers();
    renderHook(() => useSSE('/api/sse', 'overview'));
    const first = FakeEventSource.instance;

    act(() => {
      first?.simulateError();
    });
    expect(FakeEventSource.instance).toBe(first);

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(FakeEventSource.instance).not.toBe(first);
  });

  it('clears stale and error after reconnect delivers data', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSSE('/api/sse', 'overview'));

    act(() => {
      FakeEventSource.instance?.simulateError();
    });
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    act(() => {
      FakeEventSource.instance?.emit('overview', makeOverviewEvent());
    });

    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).not.toBeNull();
  });
});
