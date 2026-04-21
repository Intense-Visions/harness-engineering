import { useEffect, useState } from 'react';
import type { StreamManifest } from './useStreamReplay';

export function useRecentSessions(): {
  sessions: StreamManifest[];
  loading: boolean;
  error: string | null;
} {
  const [sessions, setSessions] = useState<StreamManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSessions() {
      try {
        const res = await fetch('/api/streams');
        if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
        const data = (await res.json()) as StreamManifest[];
        if (!cancelled) {
          setSessions(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load sessions');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchSessions();

    // Refresh every 30 seconds
    const interval = setInterval(() => void fetchSessions(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { sessions, loading, error };
}
