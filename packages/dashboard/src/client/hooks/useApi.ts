import { useState, useCallback } from 'react';

type ApiState = 'idle' | 'loading' | 'success' | 'error';

interface UseApiResult<T> {
  state: ApiState;
  data: T | null;
  error: string | null;
  run: (body?: unknown) => Promise<void>;
}

/**
 * Simple POST hook for dashboard action endpoints.
 * Manages loading/success/error state lifecycle.
 */
export function useApi<T = unknown>(url: string): UseApiResult<T> {
  const [state, setState] = useState<ApiState>('idle');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (body?: unknown) => {
      setState('loading');
      setError(null);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const json = (await res.json()) as T & { error?: string };
        if (!res.ok || (json && typeof json === 'object' && 'error' in json && json.error)) {
          setState('error');
          setError((json as { error?: string }).error ?? `HTTP ${res.status}`);
        } else {
          setState('success');
          setData(json);
        }
      } catch (e) {
        setState('error');
        setError(e instanceof Error ? e.message : 'Network error');
      }
    },
    [url]
  );

  return { state, data, error, run };
}
