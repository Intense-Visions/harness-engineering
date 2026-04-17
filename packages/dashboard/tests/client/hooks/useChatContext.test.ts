import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChatContext } from '../../../src/client/hooks/useChatContext';

describe('useChatContext', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should return empty data when no sources are provided', () => {
    const { result } = renderHook(() => useChatContext([]));
    expect(result.current.data).toEqual({});
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should fetch data from provided sources', async () => {
    const mockData = { checks: [{ id: '1', status: 'fail' }] };
    (vi.mocked(fetch) as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const { result } = renderHook(() => useChatContext(['/api/checks']));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual({ '/api/checks': mockData });
    expect(result.current.error).toBe(null);
    expect(fetch).toHaveBeenCalledWith('/api/checks');
  });

  it('should handle fetch errors', async () => {
    (vi.mocked(fetch) as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found',
    });

    const { result } = renderHook(() => useChatContext(['/api/error']));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toContain('Failed to fetch context from /api/error');
    expect(result.current.data).toEqual({});
  });
});
