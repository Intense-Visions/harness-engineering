import { useEffect, useRef, useState } from 'react';
import type { SSEEvent } from '@shared/types';

const RECONNECT_DELAY_MS = 3_000;

export interface SSEState<T> {
  data: T | null;
  lastUpdated: string | null;
  /** True when the connection dropped and stale data is being shown */
  stale: boolean;
  error: string | null;
}

/** Typed data for a specific SSE event type */
export type SSEData<T extends SSEEvent['type']> = Extract<SSEEvent, { type: T }>['data'];

/**
 * Subscribe to a typed SSE event stream.
 * Automatically reconnects after disconnect with a 3 s delay.
 */
export function useSSE<T extends SSEEvent['type']>(
  url: string,
  eventType: T
): SSEState<SSEData<T>> {
  // Use unknown internally to avoid conditional-type narrowing issues with useState
  const [state, setState] = useState<SSEState<unknown>>({
    data: null,
    lastUpdated: null,
    stale: false,
    error: null,
  });

  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let mounted = true;

    function connect() {
      es = new EventSource(url);

      es.addEventListener(eventType, (raw: Event) => {
        if (!mounted) return;
        const e = raw as MessageEvent<string>;
        try {
          const event = JSON.parse(e.data) as Extract<SSEEvent, { type: T }>;
          setState({ data: event.data, lastUpdated: event.timestamp, stale: false, error: null });
        } catch {
          // ignore malformed messages
        }
      });

      es.onerror = () => {
        if (!mounted) return;
        es?.close();
        setState((prev) => ({ ...prev, stale: true, error: 'Connection lost. Reconnecting…' }));
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    }

    connect();

    return () => {
      mounted = false;
      es?.close();
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, [url, eventType]);

  // Safe cast: the event listener populates state.data only with SSEData<T>
  return state as SSEState<SSEData<T>>;
}
