import { useEffect, useState } from 'react';
import type { RoutingConfigResponse } from '../types/routing';

export interface UseRoutingConfigResult {
  config: RoutingConfigResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Spec B Phase 7 — fetch the current routing config once on mount.
 *
 * No polling: routing config is read at orchestrator startup and is
 * effectively immutable per process. If the operator edits
 * `harness.config.json`, they restart the server; the dashboard
 * reconnects and re-fetches naturally.
 */
export function useRoutingConfig(): UseRoutingConfigResult {
  const [config, setConfig] = useState<RoutingConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/v1/routing/config', { signal: controller.signal });
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        const json = (await res.json()) as RoutingConfigResponse;
        setConfig(json);
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Network error');
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return { config, loading, error };
}
