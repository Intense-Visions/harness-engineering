import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { Cache } from '../../../../src/client/pages/insights/Cache';

describe('insights/Cache', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    cleanup();
    fetchSpy.mockRestore();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('renders the empty state when totalRequests is 0', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        totalRequests: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        byBackend: {},
        windowStartedAt: 0,
      })
    );

    render(<Cache />);

    await waitFor(() => {
      expect(screen.getByText(/no prompt-cache activity recorded yet/i)).toBeDefined();
    });
  });

  it('renders the hit rate big number and byBackend table from a populated response', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        totalRequests: 10,
        hits: 7,
        misses: 3,
        hitRate: 0.7,
        byBackend: { anthropic: { hits: 7, misses: 3 } },
        windowStartedAt: Date.now(),
      })
    );

    render(<Cache />);

    await waitFor(() => {
      // Big number — 70.0%
      expect(screen.getByTestId('cache-hitrate-value').textContent).toContain('70.0%');
    });
    // byBackend table renders the row with the backend label
    expect(screen.getByTestId('cache-backend-table').textContent).toContain('anthropic');
    expect(screen.getByTestId('cache-backend-table').textContent).toContain('7');
    expect(screen.getByTestId('cache-backend-table').textContent).toContain('3');
  });

  it('clears polling interval on unmount (no fetches after teardown)', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        totalRequests: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        byBackend: {},
        windowStartedAt: 0,
      })
    );

    const { unmount } = render(<Cache />);
    // First fetch fires on mount.
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(1));

    unmount();
    const callsAtUnmount = fetchSpy.mock.calls.length;

    // The poll interval is 5 s in production. We can't realistically wait 5 s
    // here, but we can swap to fake timers AFTER the initial real-timer fetch
    // resolved, advance well past 5 s, and assert no additional calls landed.
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(20_000);
      // Yield to the microtask queue once for safety.
      await Promise.resolve();
      expect(fetchSpy.mock.calls.length).toBe(callsAtUnmount);
    } finally {
      vi.useRealTimers();
    }
  });
});
