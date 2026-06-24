import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSignals } from '../../../src/client/hooks/useSignals';

afterEach(() => vi.restoreAllMocks());

const envelope = (signals: unknown[]) => ({
  data: { signals, generatedAt: '2026-06-22T00:00:00Z' },
  timestamp: '2026-06-22T00:00:00Z',
});

describe('useSignals', () => {
  it('fetches /api/signals and exposes signals (Truth 1)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(envelope([{ id: 'x', label: 'X' }])), { status: 200 })
    );
    const { result } = renderHook(() => useSignals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.signals).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error on non-OK response (Truth 5)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    const { result } = renderHook(() => useSignals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('500');
  });
});
