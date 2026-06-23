import { useEffect, useState } from 'react';
import type { ApiResponse } from '@shared/types';
import type { SignalsResult } from '../types/signals';

export interface UseSignalsResult {
  data: SignalsResult | null;
  loading: boolean;
  error: string | null;
}

interface SignalsSetters {
  setData: (d: SignalsResult | null) => void;
  setLoading: (l: boolean) => void;
  setError: (e: string | null) => void;
}

/** Fetch the signals snapshot and route the outcome to the hook's setters. */
async function loadSignals(controller: AbortController, setters: SignalsSetters): Promise<void> {
  try {
    const res = await fetch('/api/signals', { signal: controller.signal });
    if (!res.ok) {
      setters.setError(`HTTP ${res.status}`);
      setters.setLoading(false);
      return;
    }
    const json = (await res.json()) as ApiResponse<SignalsResult>;
    setters.setData(json.data);
    setters.setLoading(false);
  } catch (err) {
    if (controller.signal.aborted) return;
    setters.setError(err instanceof Error ? err.message : 'Network error');
    setters.setLoading(false);
  }
}

/**
 * Spec 534 — fetch the five computed signals once on mount.
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
    void loadSignals(controller, { setData, setLoading, setError });
    return () => controller.abort();
  }, []);

  return { data, loading, error };
}
