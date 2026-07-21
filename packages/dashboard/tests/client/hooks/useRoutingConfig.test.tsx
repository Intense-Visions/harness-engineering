import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { RoutingConfigResponse } from '../../../src/client/types/routing';
import { useRoutingConfig } from '../../../src/client/hooks/useRoutingConfig';

const CONFIG_ENDPOINT = '/api/v1/routing/config';

const mkConfig = (): RoutingConfigResponse =>
  ({
    routing: { policy: 'capability' },
    resolvedChains: {
      design: [{ candidate: 'claude-opus', exists: true }],
    },
    backends: ['claude-opus', 'qwen3-coder'],
  }) as unknown as RoutingConfigResponse;

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(mkConfig()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRoutingConfig', () => {
  it('fetches the config once on mount and exposes it with loading cleared', async () => {
    const config = mkConfig();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(config), { status: 200 })
    );

    const { result } = renderHook(() => useRoutingConfig());

    // Arrange assertion: hook starts in the loading state before the fetch settles.
    expect(result.current.loading).toBe(true);
    expect(result.current.config).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.config).toEqual(config);
    expect(result.current.error).toBeNull();
    // The hook is fetch-once-on-mount: exactly one call to the config endpoint.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      CONFIG_ENDPOINT,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('surfaces an "HTTP <status>" error for a non-ok response without setting config', async () => {
    const NOT_FOUND = 404;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('nope', { status: NOT_FOUND })
    );

    const { result } = renderHook(() => useRoutingConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(`HTTP ${NOT_FOUND}`);
    expect(result.current.config).toBeNull();
  });

  it('surfaces the thrown message on a network error', async () => {
    const failure = new Error('connection refused');
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(failure);

    const { result } = renderHook(() => useRoutingConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('connection refused');
    expect(result.current.config).toBeNull();
  });

  it('falls back to a generic "Network error" when the rejection is not an Error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce('boom');

    const { result } = renderHook(() => useRoutingConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Network error');
    expect(result.current.config).toBeNull();
  });

  it('aborts the in-flight request on unmount and does not record an error', async () => {
    let capturedSignal: AbortSignal | undefined;
    // Never-resolving fetch keeps the request in flight until we unmount.
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_url: string, init: { signal: AbortSignal }) => {
        capturedSignal = init.signal;
        return new Promise(() => {});
      }
    );

    const { result, unmount } = renderHook(() => useRoutingConfig());

    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
    // Cleanup abort must not flip the hook into an error state.
    expect(result.current.error).toBeNull();
  });
});
