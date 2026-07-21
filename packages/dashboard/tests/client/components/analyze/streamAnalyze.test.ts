import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  streamAnalyze,
  type AnalyzeCallbacks,
} from '../../../../src/client/components/analyze/streamAnalyze';
import type { AnalyzeSSEEvent } from '../../../../src/client/types/orchestrator';
import type {
  SELResult,
  CMLResult,
  PESLResult,
  Signal,
} from '../../../../src/client/components/analyze/types';

/**
 * Build a mock `fetch` Response whose body streams the given string chunks as
 * UTF-8 encoded Uint8Arrays, one per `reader.read()` call. This drives
 * `streamAnalyze`'s SSE parsing deterministically, including buffer-split
 * cases where a single `data:` line spans two reads.
 */
function makeStreamResponse(
  chunks: string[],
  opts: {
    ok?: boolean;
    status?: number;
    hasBody?: boolean;
    contentType?: string;
    json?: () => Promise<unknown>;
  } = {}
): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const body =
    (opts.hasBody ?? true)
      ? {
          getReader() {
            return {
              read: async () => {
                if (i < chunks.length) {
                  const value = encoder.encode(chunks[i]!);
                  i += 1;
                  return { done: false, value };
                }
                return { done: true, value: undefined };
              },
            };
          },
        }
      : null;
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? (opts.contentType ?? null) : null,
    },
    body,
    json: opts.json ?? (async () => ({})),
  } as unknown as Response;
}

function makeCallbacks() {
  const statuses: string[] = [];
  const sels: SELResult[] = [];
  const cmls: CMLResult[] = [];
  const pesls: PESLResult[] = [];
  const signalBatches: Signal[][] = [];
  const errors: string[] = [];
  let doneCount = 0;
  const callbacks: AnalyzeCallbacks = {
    onStatus: (text) => statuses.push(text),
    onSEL: (data) => sels.push(data),
    onCML: (data) => cmls.push(data),
    onPESL: (data) => pesls.push(data),
    onSignals: (data) => signalBatches.push(data),
    onError: (error) => errors.push(error),
    onDone: () => {
      doneCount += 1;
    },
  };
  return {
    callbacks,
    statuses,
    sels,
    cmls,
    pesls,
    signalBatches,
    errors,
    get doneCount() {
      return doneCount;
    },
  };
}

/** Serialize an SSE event the way the server would: `data: <json>\n`. */
function sse(event: AnalyzeSSEEvent): string {
  return `data: ${JSON.stringify(event)}\n`;
}

const DONE_LINE = 'data: [DONE]\n';

describe('streamAnalyze', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs the analyze body to /api/analyze with the abort signal', async () => {
    const fetchMock = vi.fn(async () => makeStreamResponse([DONE_LINE]));
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();
    const controller = new AbortController();

    await streamAnalyze(
      { title: 'A title', description: 'A description', labels: ['bug'] },
      c.callbacks,
      controller.signal
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/analyze');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.signal).toBe(controller.signal);
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'A title',
      description: 'A description',
      labels: ['bug'],
    });
  });

  it('dispatches each typed event to its matching callback, then [DONE]', async () => {
    const sel = { intent: 'ship' } as unknown as SELResult;
    const cml = { overall: 42 } as unknown as CMLResult;
    const pesl = { abort: false } as unknown as PESLResult;
    const signals: Signal[] = [{ name: 'sig', reason: 'because' }];
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([
        sse({ type: 'status', text: 'analyzing' }),
        sse({ type: 'sel_result', data: sel as unknown as Record<string, unknown> }),
        sse({ type: 'cml_result', data: cml as unknown as Record<string, unknown> }),
        sse({ type: 'pesl_result', data: pesl as unknown as Record<string, unknown> }),
        sse({ type: 'signals', data: signals }),
        DONE_LINE,
      ])
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamAnalyze({ title: 'x' }, c.callbacks, new AbortController().signal);

    expect(c.statuses).toEqual(['analyzing']);
    expect(c.sels).toEqual([sel]);
    expect(c.cmls).toEqual([cml]);
    expect(c.pesls).toEqual([pesl]);
    expect(c.signalBatches).toEqual([signals]);
    expect(c.errors).toEqual([]);
    expect(c.doneCount).toBe(1);
  });

  it('reassembles a data line split across two reads', async () => {
    const line = sse({ type: 'status', text: 'streamed-status' });
    const mid = Math.floor(line.length / 2);
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([line.slice(0, mid), line.slice(mid), DONE_LINE])
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamAnalyze({ title: 'x' }, c.callbacks, new AbortController().signal);

    expect(c.statuses).toEqual(['streamed-status']);
    expect(c.doneCount).toBe(1);
  });

  it('routes an error event to onError and stops processing further lines', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([
        sse({ type: 'error', error: 'boom' }),
        sse({ type: 'status', text: 'should-not-arrive' }),
        DONE_LINE,
      ])
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamAnalyze({ title: 'x' }, c.callbacks, new AbortController().signal);

    expect(c.errors).toEqual(['boom']);
    expect(c.statuses).toEqual([]);
    expect(c.doneCount).toBe(0);
  });

  it('skips malformed JSON lines and lines without a data: prefix', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([
        ': this is a comment line\n',
        'data: {not valid json}\n',
        sse({ type: 'status', text: 'survivor' }),
        DONE_LINE,
      ])
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamAnalyze({ title: 'x' }, c.callbacks, new AbortController().signal);

    expect(c.statuses).toEqual(['survivor']);
    expect(c.errors).toEqual([]);
    expect(c.doneCount).toBe(1);
  });

  it('skips JSON payloads that are not objects with a type field', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([
        'data: null\n',
        'data: 42\n',
        'data: {"noType":true}\n',
        sse({ type: 'status', text: 'ok' }),
        DONE_LINE,
      ])
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamAnalyze({ title: 'x' }, c.callbacks, new AbortController().signal);

    expect(c.statuses).toEqual(['ok']);
    expect(c.errors).toEqual([]);
  });

  it('ignores an unknown event type without stopping the stream', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([
        'data: {"type":"mystery"}\n',
        sse({ type: 'status', text: 'after-unknown' }),
        DONE_LINE,
      ])
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamAnalyze({ title: 'x' }, c.callbacks, new AbortController().signal);

    expect(c.statuses).toEqual(['after-unknown']);
    expect(c.doneCount).toBe(1);
  });

  it('calls onDone when the stream ends without an explicit [DONE]', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([sse({ type: 'status', text: 'trailing' })])
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamAnalyze({ title: 'x' }, c.callbacks, new AbortController().signal);

    expect(c.statuses).toEqual(['trailing']);
    expect(c.doneCount).toBe(1);
  });

  it('reports the server-provided error on a non-ok JSON response', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([], {
        ok: false,
        status: 500,
        contentType: 'application/json',
        json: async () => ({ error: 'server exploded' }),
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamAnalyze({ title: 'x' }, c.callbacks, new AbortController().signal);

    expect(c.errors).toEqual(['server exploded']);
    expect(c.doneCount).toBe(0);
  });

  it('falls back to HTTP status on a non-ok JSON response without an error field', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([], {
        ok: false,
        status: 422,
        contentType: 'application/json',
        json: async () => ({}),
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamAnalyze({ title: 'x' }, c.callbacks, new AbortController().signal);

    expect(c.errors).toEqual(['HTTP 422']);
  });

  it('reports HTTP status on a non-ok non-JSON response', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([], { ok: false, status: 503, contentType: 'text/plain' })
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamAnalyze({ title: 'x' }, c.callbacks, new AbortController().signal);

    expect(c.errors).toEqual(['HTTP 503']);
  });

  it('reports a missing response stream', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([], { ok: true, status: 200, hasBody: false })
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamAnalyze({ title: 'x' }, c.callbacks, new AbortController().signal);

    expect(c.errors).toEqual(['No response stream']);
  });

  it('swallows AbortError without calling onError', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    const fetchMock = vi.fn(async () => {
      throw abortErr;
    });
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamAnalyze({ title: 'x' }, c.callbacks, new AbortController().signal);

    expect(c.errors).toEqual([]);
    expect(c.doneCount).toBe(0);
  });

  it('reports the message of a non-abort network failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('connection reset');
    });
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamAnalyze({ title: 'x' }, c.callbacks, new AbortController().signal);

    expect(c.errors).toEqual(['connection reset']);
  });
});
