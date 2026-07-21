import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChatSessionsSync } from '../../../src/client/hooks/useChatSessionsSync';
import { useThreadStore } from '../../../src/client/stores/threadStore';
import type { ChatSession } from '../../../src/client/types/chat-session';
import type { ChatMessage } from '../../../src/client/types/chat';

const SESSIONS_URL = '/api/sessions';

/** A stable, valid ChatSession; callers override only the fields under test. */
function makeSession(overrides: Partial<ChatSession> & { sessionId: string }): ChatSession {
  return {
    command: null,
    interactionId: null,
    label: 'New Chat',
    createdAt: '2026-07-20T00:00:00.000Z',
    lastActiveAt: '2026-07-20T00:00:00.000Z',
    artifacts: [],
    status: 'active',
    messages: [],
    input: '',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Mock fetch that only answers /api/sessions; any other URL is a hard failure. */
function stubSessionsFetch(handler: () => Response | Promise<Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url !== SESSIONS_URL) throw new Error(`Unexpected fetch: ${url}`);
    return handler();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// The thread store is a module-level singleton; reset the mutable slices we
// touch and swap markSourceHydrated for a fresh spy before every test so call
// counts and thread state never leak between cases.
let markSourceHydrated: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.restoreAllMocks();
  markSourceHydrated = vi.fn();
  useThreadStore.setState({
    threads: new Map(),
    messages: new Map(),
    markSourceHydrated,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useChatSessionsSync', () => {
  it('hydrates persisted sessions into chat threads with labels and messages', async () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'scan my repo' },
      { role: 'assistant', blocks: [{ kind: 'text', text: 'on it' }] },
    ];
    const fetchMock = stubSessionsFetch(() =>
      jsonResponse([
        makeSession({
          sessionId: 's1',
          command: 'harness:security-scan',
          label: 'My Security Chat',
          messages: history,
        }),
        makeSession({ sessionId: 's2', command: null, label: 'New Chat', messages: [] }),
      ])
    );

    renderHook(() => useChatSessionsSync());
    await waitFor(() => expect(markSourceHydrated).toHaveBeenCalled());

    const state = useThreadStore.getState();
    const labelled = state.threads.get('chat:s1');
    expect(labelled).toBeDefined();
    expect(labelled?.type).toBe('chat');
    expect(labelled?.title).toBe('My Security Chat');
    expect(labelled?.meta).toMatchObject({ sessionId: 's1', command: 'harness:security-scan' });
    expect(state.messages.get('chat:s1')).toEqual(history);

    // Second session created too, but with no non-empty messages persisted.
    expect(state.threads.has('chat:s2')).toBe(true);
    expect(state.messages.has('chat:s2')).toBe(false);

    expect(fetchMock).toHaveBeenCalledWith(SESSIONS_URL);
  });

  it('leaves a "New Chat"-labelled session on its command-derived title', async () => {
    stubSessionsFetch(() =>
      jsonResponse([
        makeSession({ sessionId: 's3', command: 'harness:foo-bar', label: 'New Chat' }),
      ])
    );

    renderHook(() => useChatSessionsSync());
    await waitFor(() => expect(markSourceHydrated).toHaveBeenCalled());

    // label === 'New Chat' means the hook must NOT override the store's default
    // title, which derives 'foo-bar' from the command.
    expect(useThreadStore.getState().threads.get('chat:s3')?.title).toBe('foo-bar');
  });

  it('skips sessions that lack a sessionId', async () => {
    stubSessionsFetch(() =>
      jsonResponse([
        makeSession({ sessionId: '' }),
        makeSession({ sessionId: 's4', label: 'Kept' }),
      ])
    );

    renderHook(() => useChatSessionsSync());
    await waitFor(() => expect(markSourceHydrated).toHaveBeenCalled());

    const state = useThreadStore.getState();
    expect(state.threads.size).toBe(1);
    expect(state.threads.has('chat:s4')).toBe(true);
    expect(state.threads.has('chat:')).toBe(false);
  });

  it('does not overwrite an already-present chat thread', async () => {
    const store = useThreadStore.getState();
    store.createThread('chat', { sessionId: 'dup', command: null });
    store.updateThread('chat:dup', { title: 'Original Title' });

    stubSessionsFetch(() =>
      jsonResponse([
        makeSession({
          sessionId: 'dup',
          label: 'Server Label',
          messages: [{ role: 'user', content: 'from disk' }],
        }),
      ])
    );

    renderHook(() => useChatSessionsSync());
    await waitFor(() => expect(markSourceHydrated).toHaveBeenCalled());

    const state = useThreadStore.getState();
    // Existing thread is left untouched: no title change, no message hydration.
    expect(state.threads.get('chat:dup')?.title).toBe('Original Title');
    expect(state.messages.has('chat:dup')).toBe(false);
  });

  it('marks the store hydrated when the endpoint responds non-OK', async () => {
    stubSessionsFetch(() => jsonResponse(null, 500));

    renderHook(() => useChatSessionsSync());
    await waitFor(() => expect(markSourceHydrated).toHaveBeenCalled());

    expect(useThreadStore.getState().threads.size).toBe(0);
  });

  it('ignores a non-array payload but still marks hydrated', async () => {
    stubSessionsFetch(() => jsonResponse({ not: 'an array' }));

    renderHook(() => useChatSessionsSync());
    await waitFor(() => expect(markSourceHydrated).toHaveBeenCalled());

    expect(useThreadStore.getState().threads.size).toBe(0);
  });

  it('marks hydrated and swallows a rejected fetch', async () => {
    stubSessionsFetch(() => Promise.reject(new Error('network down')));

    renderHook(() => useChatSessionsSync());
    await waitFor(() => expect(markSourceHydrated).toHaveBeenCalled());

    expect(useThreadStore.getState().threads.size).toBe(0);
  });

  it('fetches /api/sessions exactly once across re-renders', async () => {
    const fetchMock = stubSessionsFetch(() => jsonResponse([makeSession({ sessionId: 's5' })]));

    const { rerender } = renderHook(() => useChatSessionsSync());
    await waitFor(() => expect(markSourceHydrated).toHaveBeenCalled());

    rerender();
    rerender();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(SESSIONS_URL);
  });
});
