import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useStreamReplay } from '../../../src/client/hooks/useStreamReplay';
import type { StreamManifest } from '../../../src/client/hooks/useStreamReplay';

const ISSUE_ID = 'ISS-42';
const MANIFEST_URL = `/api/streams/${ISSUE_ID}/manifest`;
const STREAM_URL = `/api/streams/${ISSUE_ID}`;

const MANIFEST: StreamManifest = {
  issueId: ISSUE_ID,
  externalId: 42,
  identifier: 'ISS-42',
  title: 'Replay me',
  attempts: [
    {
      attempt: 1,
      startedAt: '2026-07-20T00:00:00.000Z',
      endedAt: '2026-07-20T00:05:00.000Z',
      outcome: 'success',
      stats: {
        durationMs: 300_000,
        inputTokens: 100,
        outputTokens: 200,
        turnCount: 3,
        toolsCalled: ['readFile'],
        filesTouched: ['a.ts'],
      },
    },
  ],
  pr: null,
  highlights: null,
};

/**
 * A JSONL fixture exercising every parse path the hook cares about:
 * session_start/session_end are dropped, consecutive text events coalesce,
 * a `call` event becomes a tool_use block, and a malformed line is skipped.
 */
const JSONL_STREAM = [
  JSON.stringify({ type: 'session_start', timestamp: '2026-07-20T00:00:00.000Z' }),
  JSON.stringify({ type: 'text', content: 'Hello ', timestamp: '2026-07-20T00:00:01.000Z' }),
  JSON.stringify({ type: 'text', content: 'world', timestamp: '2026-07-20T00:00:02.000Z' }),
  '{ this is not valid json',
  JSON.stringify({
    type: 'call',
    content: 'Calling readFile(path.ts)',
    timestamp: '2026-07-20T00:00:03.000Z',
  }),
  JSON.stringify({ type: 'session_end', timestamp: '2026-07-20T00:00:04.000Z' }),
].join('\n');

type FetchHandler = () => Response | Promise<Response>;

/** Build a URL-routed fetch mock; any unrouted URL is a hard failure. */
function routedFetch(routes: Record<string, FetchHandler>): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input);
    const handler = routes[url];
    if (!handler) throw new Error(`Unexpected fetch: ${url}`);
    return handler();
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useStreamReplay', () => {
  it('fetches the manifest then parses the JSONL stream into coalesced ContentBlocks', async () => {
    const fetchMock = routedFetch({
      [MANIFEST_URL]: () => new Response(JSON.stringify(MANIFEST), { status: 200 }),
      [STREAM_URL]: () => new Response(JSONL_STREAM, { status: 200 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useStreamReplay(ISSUE_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.manifest).toEqual(MANIFEST);
    expect(result.current.error).toBeNull();
    // session_start/end dropped; two text events coalesced; malformed line skipped;
    // call -> tool_use with parsed args.
    expect(result.current.recordedBlocks).toEqual([
      { kind: 'text', text: 'Hello world' },
      { kind: 'tool_use', tool: 'readFile', args: 'path.ts' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(MANIFEST_URL);
    expect(fetchMock).toHaveBeenCalledWith(STREAM_URL);
  });

  it('treats a 404 manifest as "no recording yet": null manifest, empty blocks, no error', async () => {
    const streamHandler = vi.fn(() => new Response(JSONL_STREAM, { status: 200 }));
    const fetchMock = routedFetch({
      [MANIFEST_URL]: () => new Response(null, { status: 404 }),
      [STREAM_URL]: streamHandler,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useStreamReplay(ISSUE_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.manifest).toBeNull();
    expect(result.current.recordedBlocks).toEqual([]);
    expect(result.current.error).toBeNull();
    // A missing manifest short-circuits before the stream is ever fetched.
    expect(streamHandler).not.toHaveBeenCalled();
  });

  it('surfaces a non-404 manifest failure via the error field', async () => {
    const fetchMock = routedFetch({
      [MANIFEST_URL]: () => new Response(null, { status: 500 }),
      [STREAM_URL]: () => new Response(JSONL_STREAM, { status: 200 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useStreamReplay(ISSUE_ID));

    await waitFor(() => expect(result.current.error).toBe('Manifest fetch failed: 500'));
    expect(result.current.loading).toBe(false);
    expect(result.current.manifest).toBeNull();
  });

  it('surfaces a stream fetch failure via the error field after the manifest loads', async () => {
    const fetchMock = routedFetch({
      [MANIFEST_URL]: () => new Response(JSON.stringify(MANIFEST), { status: 200 }),
      [STREAM_URL]: () => new Response(null, { status: 503 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useStreamReplay(ISSUE_ID));

    await waitFor(() => expect(result.current.error).toBe('Stream fetch failed: 503'));
    expect(result.current.loading).toBe(false);
    // The manifest was fetched successfully before the stream failed.
    expect(result.current.manifest).toEqual(MANIFEST);
  });

  it('requests the attempt-scoped stream URL when an attempt number is supplied', async () => {
    const attempt = 2;
    const attemptUrl = `/api/streams/${ISSUE_ID}/${attempt}`;
    const fetchMock = routedFetch({
      [MANIFEST_URL]: () => new Response(JSON.stringify(MANIFEST), { status: 200 }),
      [attemptUrl]: () => new Response(JSONL_STREAM, { status: 200 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useStreamReplay(ISSUE_ID, attempt));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith(attemptUrl);
    expect(fetchMock).not.toHaveBeenCalledWith(STREAM_URL);
    expect(result.current.recordedBlocks).toHaveLength(2);
  });

  it('does no fetching and holds cleared state when issueId is null', async () => {
    const fetchMock = routedFetch({});
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useStreamReplay(null));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.manifest).toBeNull();
    expect(result.current.recordedBlocks).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('does not re-fetch on a re-render with unchanged inputs', async () => {
    const fetchMock = routedFetch({
      [MANIFEST_URL]: () => new Response(JSON.stringify(MANIFEST), { status: 200 }),
      [STREAM_URL]: () => new Response(JSONL_STREAM, { status: 200 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(() => useStreamReplay(ISSUE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsAfterLoad = fetchMock.mock.calls.length;
    // Exactly one manifest + one stream request for the initial load.
    expect(callsAfterLoad).toBe(2);

    rerender();
    rerender();

    expect(fetchMock).toHaveBeenCalledTimes(callsAfterLoad);
  });
});
