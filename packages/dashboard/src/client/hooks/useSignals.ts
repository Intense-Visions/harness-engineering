import { useEffect, useState } from 'react';
import type { ApiResponse } from '@shared/types';
import type { SignalsResult } from '../types/signals';

export interface UseSignalsResult {
  data: SignalsResult | null;
  loading: boolean;
  error: string | null;
}

/**
 * Spec #534 — fetch the five computed signals once on mount.
 *
 * No polling: signals are recomputed server-side on a cadence; the
 * dashboard reads the latest snapshot on navigation. Mirrors the
 * one-shot fetch shape of `useRoutingConfig`.
 */
export function useSignals(): UseSignalsResult {
  const [data, setData] = useState<SignalsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/signals', { signal: controller.signal });
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        const json = (await res.json()) as ApiResponse<SignalsResult>;
        setData(json.data);
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Network error');
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return { data, loading, error };
}
