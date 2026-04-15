import { useState, useEffect } from 'react';

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

/**
 * Hook to fetch contextual data for a skill from specified API endpoints.
 * This is used to populate the BriefingPanel before a skill is executed.
 */
export function useChatContext(sources?: string[]): ChatContextState {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sources || sources.length === 0) {
      setData({});
      setIsLoading(false);
      setError(null);
      return;
    }

    let mounted = true;

    setIsLoading(true);
    setError(null);

    Promise.all(sources.map(fetchSource))
      .then((results) => {
        if (mounted) setData(toContextMap(results));
      })
      .catch((err) => {
        if (mounted)
          setError(err instanceof Error ? err.message : 'Unknown error fetching chat context');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [sources]);

  return { data, isLoading, error };
}
