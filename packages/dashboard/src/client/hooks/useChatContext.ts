import { useState, useEffect, useMemo } from 'react';

export interface ChatContextState {
  data: Record<string, unknown>;
  isLoading: boolean;
  error: string | null;
}

async function fetchSource(source: string): Promise<{ source: string; data: unknown }> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to fetch context from ${source}: ${response.statusText}`);
  }
  const json = await response.json();
  return { source, data: json };
}

function toContextMap(results: { source: string; data: unknown }[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const { source, data } of results) {
    map[source] = data;
  }
  return map;
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error fetching chat context';
}

function parseSources(key: string): string[] {
  return key ? key.split('|') : [];
}

function resetState(
  setData: (d: Record<string, unknown>) => void,
  setIsLoading: (v: boolean) => void,
  setError: (e: string | null) => void
): void {
  setData({});
  setIsLoading(false);
  setError(null);
}

/**
 * Hook to fetch contextual data for a skill from specified API endpoints.
 * This is used to populate the BriefingPanel before a skill is executed.
 */
export function useChatContext(sources?: string[]): ChatContextState {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable dependency key so passing a fresh array literal doesn't re-fire the effect
  const sourcesKey = useMemo(() => (sources ?? []).join('|'), [sources]);

  useEffect(() => {
    const list = parseSources(sourcesKey);
    if (list.length === 0) {
      resetState(setData, setIsLoading, setError);
      return;
    }

    let mounted = true;

    setIsLoading(true);
    setError(null);

    Promise.all(list.map(fetchSource))
      .then((results) => {
        if (mounted) setData(toContextMap(results));
      })
      .catch((err) => {
        if (mounted) setError(toErrorMessage(err));
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [sourcesKey]);

  return { data, isLoading, error };
}
