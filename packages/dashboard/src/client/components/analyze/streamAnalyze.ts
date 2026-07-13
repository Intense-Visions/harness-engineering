import type { AnalyzeSSEEvent } from '../../types/orchestrator';
import type { SELResult, CMLResult, PESLResult, Signal } from './types';

export interface AnalyzeCallbacks {
  onStatus: (text: string) => void;
  onSEL: (data: SELResult) => void;
  onCML: (data: CMLResult) => void;
  onPESL: (data: PESLResult) => void;
  onSignals: (data: Signal[]) => void;
  onError: (error: string) => void;
  onDone: () => void;
}

/**
 * Dispatch a single decoded SSE event to the matching callback.
 * Returns `true` when the stream should stop (done or error).
 */
function dispatchAnalyzeEvent(event: AnalyzeSSEEvent, callbacks: AnalyzeCallbacks): boolean {
  switch (event.type) {
    case 'status':
      callbacks.onStatus(event.text);
      return false;
    case 'sel_result':
      callbacks.onSEL(event.data as unknown as SELResult);
      return false;
    case 'cml_result':
      callbacks.onCML(event.data as unknown as CMLResult);
      return false;
    case 'pesl_result':
      callbacks.onPESL(event.data as unknown as PESLResult);
      return false;
    case 'signals':
      callbacks.onSignals(event.data);
      return false;
    case 'error':
      callbacks.onError(event.error);
      return true;
    default:
      return false;
  }
}

/**
 * Parse one `data: ` SSE line and dispatch it. Returns 'continue' for a
 * normal event, 'done' for the [DONE] sentinel, or 'stop' for a terminal
 * error event. Malformed / non-data lines resolve to 'continue'.
 */
function handleAnalyzeLine(
  line: string,
  callbacks: AnalyzeCallbacks
): 'continue' | 'done' | 'stop' {
  if (!line.startsWith('data: ')) return 'continue';
  const payload = line.slice(6).trim();
  if (payload === '[DONE]') return 'done';
  try {
    // harness-ignore SEC-DES-001: client-side SSE consumer; trust boundary is the server, shape gated by typeof+`type` check on next line
    const raw: unknown = JSON.parse(payload);
    if (typeof raw !== 'object' || raw === null || !('type' in raw)) return 'continue';
    return dispatchAnalyzeEvent(raw as AnalyzeSSEEvent, callbacks) ? 'stop' : 'continue';
  } catch {
    // skip malformed SSE lines
    return 'continue';
  }
}

/** Read the SSE body to completion, dispatching each line. */
async function pumpAnalyzeStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: AnalyzeCallbacks
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const outcome = handleAnalyzeLine(line, callbacks);
      if (outcome === 'done') {
        callbacks.onDone();
        return;
      }
      if (outcome === 'stop') return;
    }
  }

  callbacks.onDone();
}

export async function streamAnalyze(
  body: { title: string; description?: string; labels?: string[] },
  callbacks: AnalyzeCallbacks,
  signal: AbortSignal
): Promise<void> {
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      if (res.headers.get('content-type')?.includes('application/json')) {
        const json = (await res.json()) as { error?: string };
        callbacks.onError(json.error ?? `HTTP ${res.status}`);
      } else {
        callbacks.onError(`HTTP ${res.status}`);
      }
      return;
    }

    if (!res.body) {
      callbacks.onError('No response stream');
      return;
    }

    await pumpAnalyzeStream(res.body.getReader(), callbacks);
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      callbacks.onError((err as Error).message ?? 'Stream failed');
    }
  }
}
