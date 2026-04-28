import { useEffect, useState, useRef } from 'react';
import type { ContentBlock } from '../types/chat';
import { applyAgentEvent } from '../utils/agent-events';

export interface StreamManifest {
  issueId: string;
  externalId: number | string | null;
  identifier: string;
  title?: string;
  attempts: Array<{
    attempt: number;
    startedAt: string;
    endedAt: string | null;
    outcome: string | null;
    stats: {
      durationMs: number;
      inputTokens: number;
      outputTokens: number;
      turnCount: number;
      toolsCalled: string[];
      filesTouched: string[];
    };
  }>;
  pr: { number: number; linkedAt: string; status: string } | null;
  highlights: {
    extractedAt: string;
    postedToPr: boolean;
    moments: Array<{ timestamp: string; summary: string; category: string }>;
  } | null;
}

export interface UseStreamReplayResult {
  manifest: StreamManifest | null;
  recordedBlocks: ContentBlock[];
  loading: boolean;
  error: string | null;
}

/** Parse a JSONL string into ContentBlock[] using the same logic as live events. */
function parseJsonlToBlocks(text: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const lines = text.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      // harness-ignore SEC-DES-001: parsing self-written JSONL from orchestrator — trusted internal source
      const raw = JSON.parse(line) as Record<string, unknown>;
      if (raw.type === 'session_start' || raw.type === 'session_end') continue;

      const event = buildEventFromRaw(raw);
      applyAgentEvent(blocks, event);
    } catch {
      // Skip malformed lines
    }
  }

  return blocks;
}

function buildEventFromRaw(raw: Record<string, unknown>): {
  type: string;
  timestamp: string;
  content?: string;
  subtype?: string;
  sessionId?: string;
} {
  const event: {
    type: string;
    timestamp: string;
    content?: string;
    subtype?: string;
    sessionId?: string;
  } = {
    type: typeof raw.type === 'string' ? raw.type : '',
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : '',
  };
  if (typeof raw.content === 'string') event.content = raw.content;
  else if (raw.content != null) event.content = JSON.stringify(raw.content);
  if (typeof raw.subtype === 'string') event.subtype = raw.subtype;
  if (typeof raw.sessionId === 'string') event.sessionId = raw.sessionId;
  return event;
}

/**
 * Fetches recorded stream history for a given issue and parses it into
 * ContentBlock[] using the same applyAgentEvent logic used for live events.
 */
export function useStreamReplay(issueId: string | null, attempt?: number): UseStreamReplayResult {
  const [manifest, setManifest] = useState<StreamManifest | null>(null);
  const [recordedBlocks, setRecordedBlocks] = useState<ContentBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!issueId) {
      setManifest(null);
      setRecordedBlocks([]);
      setError(null);
      fetchedRef.current = null;
      return;
    }

    // Avoid re-fetching the same issue
    const cacheKey = `${issueId}:${String(attempt ?? 'latest')}`;
    if (fetchedRef.current === cacheKey) return;

    let cancelled = false;

    async function fetchStream() {
      setLoading(true);
      setError(null);

      try {
        const manifestData = await fetchManifest(issueId!);
        if (cancelled) return;

        if (!manifestData) {
          setManifest(null);
          setRecordedBlocks([]);
          setLoading(false);
          return;
        }
        setManifest(manifestData);

        const blocks = await fetchAndParseStream(issueId!, attempt);
        if (cancelled) return;

        setRecordedBlocks(blocks);
        fetchedRef.current = cacheKey;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load stream');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchStream();

    return () => {
      cancelled = true;
    };
  }, [issueId, attempt]);

  return { manifest, recordedBlocks, loading, error };
}

/** Fetch manifest, returning null for 404 (stream doesn't exist yet). */
async function fetchManifest(issueId: string): Promise<StreamManifest | null> {
  const res = await fetch(`/api/streams/${issueId}/manifest`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
  return (await res.json()) as StreamManifest;
}

/** Fetch JSONL stream and parse into ContentBlock[]. */
async function fetchAndParseStream(issueId: string, attempt?: number): Promise<ContentBlock[]> {
  const url = attempt != null ? `/api/streams/${issueId}/${attempt}` : `/api/streams/${issueId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Stream fetch failed: ${res.status}`);
  const text = await res.text();
  return parseJsonlToBlocks(text);
}
