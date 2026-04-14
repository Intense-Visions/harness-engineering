import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOrchestratorSocket } from '../../../src/client/hooks/useOrchestratorSocket';
import type {
  OrchestratorSnapshot,
  PendingInteraction,
} from '../../../src/client/types/orchestrator';

// --- Minimal WebSocket mock ---
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
    // Simulate async open
    setTimeout(() => this.onopen?.(), 0);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

beforeEach(() => {
  FakeWebSocket.instance = null;
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function makeSnapshot(overrides?: Partial<OrchestratorSnapshot>): OrchestratorSnapshot {
  return {
    running: [],
    retryAttempts: [],
    claimed: [],
    tokenTotals: { inputTokens: 100, outputTokens: 200, totalTokens: 300, secondsRunning: 60 },
    maxConcurrentAgents: 5,
    globalCooldownUntilMs: null,
    recentRequestTimestamps: [],
    recentInputTokens: [],
    recentOutputTokens: [],
    maxRequestsPerMinute: 50,
    maxRequestsPerSecond: 2,
    maxInputTokensPerMinute: 80000,
    maxOutputTokensPerMinute: 40000,
    ...overrides,
  };
}

function makeInteraction(): PendingInteraction {
  return {
    id: 'int-1',
    issueId: 'issue-1',
    type: 'needs-human',
    reasons: ['full-exploration'],
    context: {
      issueTitle: 'Complex feature',
      issueDescription: 'Needs human input',
      specPath: null,
      planPath: null,
      relatedFiles: [],
    },
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
}

describe('useOrchestratorSocket', () => {
  it('starts with null state and empty interactions', () => {
    const { result } = renderHook(() => useOrchestratorSocket());
    expect(result.current.snapshot).toBeNull();
    expect(result.current.interactions).toEqual([]);
    expect(result.current.connected).toBe(false);
  });

  it('updates snapshot on state_change message', async () => {
    const { result } = renderHook(() => useOrchestratorSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const snap = makeSnapshot();
    act(() => {
      FakeWebSocket.instance?.simulateMessage({ type: 'state_change', data: snap });
    });

    expect(result.current.snapshot).toEqual(snap);
    expect(result.current.connected).toBe(true);
  });

  it('adds interaction on interaction_new message', async () => {
    const { result } = renderHook(() => useOrchestratorSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const interaction = makeInteraction();
    act(() => {
      FakeWebSocket.instance?.simulateMessage({ type: 'interaction_new', data: interaction });
    });

    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]?.id).toBe('int-1');
  });

  it('does not duplicate interactions with same id', async () => {
    const { result } = renderHook(() => useOrchestratorSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const interaction = makeInteraction();
    act(() => {
      FakeWebSocket.instance?.simulateMessage({ type: 'interaction_new', data: interaction });
      FakeWebSocket.instance?.simulateMessage({ type: 'interaction_new', data: interaction });
    });

    expect(result.current.interactions).toHaveLength(1);
  });

  it('attempts reconnect after close', async () => {
    renderHook(() => useOrchestratorSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const first = FakeWebSocket.instance;

    act(() => {
      first?.simulateClose();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(FakeWebSocket.instance).not.toBe(first);
  });
});
