import { useState, useEffect } from 'react';

export interface ChatContextState {
  data: Record<string, any>;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to fetch contextual data for a skill from specified API endpoints.
 * This is used to populate the BriefingPanel before a skill is executed.
 */
export function useChatContext(sources?: string[]): ChatContextState {
  const [data, setData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Return early if no sources or sources are same as previous (handled by deps array)
    if (!sources || sources.length === 0) {
      setData({});
      setIsLoading(false);
      setError(null);
      return;
    }

    let mounted = true;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          sources.map(async (source) => {
            const response = await fetch(source);
            if (!response.ok) {
              throw new Error(`Failed to fetch context from ${source}: ${response.statusText}`);
            }
            const json = await response.json();
            return { source, data: json };
          })
        );

        if (!mounted) return;

        const contextMap = results.reduce((acc, { source, data }) => {
          acc[source] = data;
          return acc;
        }, {} as Record<string, any>);

        setData(contextMap);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Unknown error fetching chat context');
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, [sources]); // NOTE: This depends on the array reference. If sources is recreacted on every render, it will refetch.

  return { data, isLoading, error };
}
