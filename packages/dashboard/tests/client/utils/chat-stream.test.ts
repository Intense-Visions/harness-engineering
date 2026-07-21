import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  streamChat,
  applyChunk,
  type StreamCallbacks,
} from '../../../src/client/utils/chat-stream';
import type { ChatSSEEvent } from '../../../src/client/types/orchestrator';
import type { ContentBlock } from '../../../src/client/types/chat';

/**
 * Build a mock `fetch` Response whose body streams the given string chunks as
 * UTF-8 encoded Uint8Arrays, one per `reader.read()` call. This lets us drive
 * `streamChat`'s SSE parsing deterministically, including buffer-split cases
 * where a single `data:` line spans two reads.
 */
function makeStreamResponse(
  chunks: string[],
  opts: { ok?: boolean; status?: number; hasBody?: boolean } = {}
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
    body,
  } as unknown as Response;
}

function makeCallbacks() {
  const sessions: string[] = [];
  const chunks: ChatSSEEvent[] = [];
  const errors: string[] = [];
  let doneCount = 0;
  const callbacks: StreamCallbacks = {
    onSession: (id) => sessions.push(id),
    onChunk: (event) => chunks.push(event),
    onDone: () => {
      doneCount += 1;
    },
    onError: (error) => errors.push(error),
  };
  return {
    callbacks,
    sessions,
    chunks,
    errors,
    get doneCount() {
      return doneCount;
    },
  };
}

/** Serialize an SSE event the way the server would: `data: <json>\n`. */
function sse(event: ChatSSEEvent): string {
  return `data: ${JSON.stringify(event)}\n`;
}

const DONE_LINE = 'data: [DONE]\n';

describe('streamChat', () => {
  beforeEach(() => {
    // Absent a stub, any unmocked fetch would throw — keep it explicit per test.
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('parses session, chunk, and [DONE] events in order', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([
        sse({ type: 'session', sessionId: 'sess-1' }),
        sse({ type: 'text', text: 'hello' }),
        DONE_LINE,
      ])
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamChat('hi', undefined, undefined, c.callbacks, new AbortController().signal);

    expect(c.sessions).toEqual(['sess-1']);
    expect(c.chunks).toEqual([{ type: 'text', text: 'hello' }]);
    expect(c.errors).toEqual([]);
    expect(c.doneCount).toBe(1);
  });

  it('sends prompt, system, and sessionId in the request body', async () => {
    const fetchMock = vi.fn(async () => makeStreamResponse([DONE_LINE]));
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamChat(
      'the-prompt',
      'the-system',
      'the-session',
      c.callbacks,
      new AbortController().signal
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/chat');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      prompt: 'the-prompt',
      system: 'the-system',
      sessionId: 'the-session',
    });
  });

  it('reassembles a data line split across two reads', async () => {
    const line = sse({ type: 'text', text: 'streamed' });
    const mid = Math.floor(line.length / 2);
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([line.slice(0, mid), line.slice(mid), DONE_LINE])
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamChat('hi', undefined, undefined, c.callbacks, new AbortController().signal);

    expect(c.chunks).toEqual([{ type: 'text', text: 'streamed' }]);
    expect(c.doneCount).toBe(1);
  });

  it('routes an error event to onError and stops processing further lines', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([
        sse({ type: 'error', error: 'boom' }),
        sse({ type: 'text', text: 'should-not-arrive' }),
        DONE_LINE,
      ])
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamChat('hi', undefined, undefined, c.callbacks, new AbortController().signal);

    expect(c.errors).toEqual(['boom']);
    expect(c.chunks).toEqual([]);
    expect(c.doneCount).toBe(0);
  });

  it('skips malformed JSON lines and lines without a data: prefix', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([
        ': this is a comment line\n',
        'data: {not valid json}\n',
        sse({ type: 'text', text: 'survivor' }),
        DONE_LINE,
      ])
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamChat('hi', undefined, undefined, c.callbacks, new AbortController().signal);

    expect(c.chunks).toEqual([{ type: 'text', text: 'survivor' }]);
    expect(c.errors).toEqual([]);
    expect(c.doneCount).toBe(1);
  });

  it('skips JSON payloads that are not objects with a type field', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([
        'data: null\n',
        'data: 42\n',
        'data: {"noType":true}\n',
        sse({ type: 'text', text: 'ok' }),
        DONE_LINE,
      ])
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamChat('hi', undefined, undefined, c.callbacks, new AbortController().signal);

    expect(c.chunks).toEqual([{ type: 'text', text: 'ok' }]);
    expect(c.errors).toEqual([]);
  });

  it('calls onDone when the stream ends without an explicit [DONE]', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([sse({ type: 'text', text: 'trailing' })])
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamChat('hi', undefined, undefined, c.callbacks, new AbortController().signal);

    expect(c.chunks).toEqual([{ type: 'text', text: 'trailing' }]);
    expect(c.doneCount).toBe(1);
  });

  it('reports an HTTP error when the response is not ok', async () => {
    const fetchMock = vi.fn(async () => makeStreamResponse([], { ok: false, status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamChat('hi', undefined, undefined, c.callbacks, new AbortController().signal);

    expect(c.errors).toEqual(['Chat request failed: HTTP 503']);
    expect(c.doneCount).toBe(0);
  });

  it('reports an HTTP error when the response has no body', async () => {
    const fetchMock = vi.fn(async () =>
      makeStreamResponse([], { ok: true, status: 200, hasBody: false })
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamChat('hi', undefined, undefined, c.callbacks, new AbortController().signal);

    expect(c.errors).toEqual(['Chat request failed: HTTP 200']);
  });

  it('swallows AbortError without calling onError', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    const fetchMock = vi.fn(async () => {
      throw abortErr;
    });
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamChat('hi', undefined, undefined, c.callbacks, new AbortController().signal);

    expect(c.errors).toEqual([]);
    expect(c.doneCount).toBe(0);
  });

  it('reports the message of a non-abort network failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('connection reset');
    });
    vi.stubGlobal('fetch', fetchMock);
    const c = makeCallbacks();

    await streamChat('hi', undefined, undefined, c.callbacks, new AbortController().signal);

    expect(c.errors).toEqual(['connection reset']);
  });
});

describe('applyChunk', () => {
  it('ignores session and error events', () => {
    const blocks: ContentBlock[] = [];
    applyChunk(blocks, { type: 'session', sessionId: 's' });
    applyChunk(blocks, { type: 'error', error: 'e' });
    expect(blocks).toEqual([]);
  });

  it('appends a new text block then coalesces consecutive text', () => {
    const blocks: ContentBlock[] = [];
    applyChunk(blocks, { type: 'text', text: 'foo' });
    applyChunk(blocks, { type: 'text', text: 'bar' });
    expect(blocks).toEqual([{ kind: 'text', text: 'foobar' }]);
  });

  it('replaces a trailing status block when text arrives', () => {
    const blocks: ContentBlock[] = [{ kind: 'status', text: 'thinking...' }];
    applyChunk(blocks, { type: 'text', text: 'answer' });
    expect(blocks).toEqual([{ kind: 'text', text: 'answer' }]);
  });

  it('coalesces consecutive thinking events', () => {
    const blocks: ContentBlock[] = [];
    applyChunk(blocks, { type: 'thinking', text: 'a' });
    applyChunk(blocks, { type: 'thinking', text: 'b' });
    expect(blocks).toEqual([{ kind: 'thinking', text: 'ab' }]);
  });

  it('does not coalesce thinking across an intervening text block', () => {
    const blocks: ContentBlock[] = [];
    applyChunk(blocks, { type: 'thinking', text: 'a' });
    applyChunk(blocks, { type: 'text', text: 'x' });
    applyChunk(blocks, { type: 'thinking', text: 'b' });
    expect(blocks).toEqual([
      { kind: 'thinking', text: 'a' },
      { kind: 'text', text: 'x' },
      { kind: 'thinking', text: 'b' },
    ]);
  });

  it('pushes a tool_use block, omitting args when absent', () => {
    const blocks: ContentBlock[] = [];
    applyChunk(blocks, { type: 'tool_use', tool: 'read' });
    expect(blocks).toEqual([{ kind: 'tool_use', tool: 'read' }]);
  });

  it('pushes a tool_use block preserving provided args', () => {
    const blocks: ContentBlock[] = [];
    applyChunk(blocks, { type: 'tool_use', tool: 'read', args: '{"path":' });
    expect(blocks).toEqual([{ kind: 'tool_use', tool: 'read', args: '{"path":' }]);
  });

  it('accumulates tool_args_delta onto the last unresolved tool_use block', () => {
    const blocks: ContentBlock[] = [];
    applyChunk(blocks, { type: 'tool_use', tool: 'read', args: '{"p":' });
    applyChunk(blocks, { type: 'tool_args_delta', text: '"a.ts"}' });
    expect(blocks).toEqual([{ kind: 'tool_use', tool: 'read', args: '{"p":"a.ts"}' }]);
  });

  it('starts args from empty string when tool_use had no args', () => {
    const blocks: ContentBlock[] = [];
    applyChunk(blocks, { type: 'tool_use', tool: 'read' });
    applyChunk(blocks, { type: 'tool_args_delta', text: 'partial' });
    expect(blocks).toEqual([{ kind: 'tool_use', tool: 'read', args: 'partial' }]);
  });

  it('attaches tool_result to the last unresolved tool_use, preserving isError', () => {
    const blocks: ContentBlock[] = [];
    applyChunk(blocks, { type: 'tool_use', tool: 'read' });
    applyChunk(blocks, { type: 'tool_result', content: 'oops', isError: true });
    expect(blocks).toEqual([{ kind: 'tool_use', tool: 'read', result: 'oops', isError: true }]);
  });

  it('omits isError when it is not provided on tool_result', () => {
    const blocks: ContentBlock[] = [];
    applyChunk(blocks, { type: 'tool_use', tool: 'read' });
    applyChunk(blocks, { type: 'tool_result', content: 'contents' });
    expect(blocks).toEqual([{ kind: 'tool_use', tool: 'read', result: 'contents' }]);
  });

  it('routes tool_result to the most recent tool_use that lacks a result', () => {
    const blocks: ContentBlock[] = [];
    applyChunk(blocks, { type: 'tool_use', tool: 'first' });
    applyChunk(blocks, { type: 'tool_result', content: 'r1' });
    applyChunk(blocks, { type: 'tool_use', tool: 'second' });
    applyChunk(blocks, { type: 'tool_result', content: 'r2' });
    expect(blocks).toEqual([
      { kind: 'tool_use', tool: 'first', result: 'r1' },
      { kind: 'tool_use', tool: 'second', result: 'r2' },
    ]);
  });

  it('replaces the trailing status block on a new status event', () => {
    const blocks: ContentBlock[] = [];
    applyChunk(blocks, { type: 'status', text: 'reading' });
    applyChunk(blocks, { type: 'status', text: 'writing' });
    expect(blocks).toEqual([{ kind: 'status', text: 'writing' }]);
  });

  it('appends a status block when the last block is not a status', () => {
    const blocks: ContentBlock[] = [{ kind: 'text', text: 'hi' }];
    applyChunk(blocks, { type: 'status', text: 'reading' });
    expect(blocks).toEqual([
      { kind: 'text', text: 'hi' },
      { kind: 'status', text: 'reading' },
    ]);
  });
});
