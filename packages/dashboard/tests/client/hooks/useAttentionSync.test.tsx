import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAttentionSync } from '../../../src/client/hooks/useAttentionSync';
import { useThreadStore } from '../../../src/client/stores/threadStore';
import type {
  PendingInteraction,
  InteractionContext,
} from '../../../src/client/types/orchestrator';
import type { OrchestratorSocketState } from '../../../src/client/hooks/useOrchestratorSocket';
import type { AttentionMeta } from '../../../src/client/types/thread';

const INTERACTIONS_URL = '/api/interactions';

/** A stable, valid InteractionContext; the hook forwards it verbatim into thread meta. */
function makeContext(): InteractionContext {
  return {
    issueTitle: 'Deploy the widget',
    issueDescription: null,
    specPath: null,
    planPath: null,
    relatedFiles: [],
  };
}

/** A stable, valid PendingInteraction; callers override only the fields under test. */
function makeInteraction(
  overrides: Partial<PendingInteraction> & { id: string }
): PendingInteraction {
  return {
    issueId: 'ENG-1',
    type: 'needs-human',
    reasons: ['low-confidence'],
    context: makeContext(),
    createdAt: '2026-07-20T00:00:00.000Z',
    status: 'pending',
    ...overrides,
  };
}

/**
 * A minimal OrchestratorSocketState. The hook only reads `interactions`; the
 * remaining fields exist purely to satisfy the interface, so no real socket,
 * network, or timer is involved.
 */
function makeSocket(interactions: PendingInteraction[]): OrchestratorSocketState {
  return {
    snapshot: null,
    interactions,
    agentEvents: {},
    connected: false,
    maintenanceEvent: null,
    localModelStatuses: [],
    removeInteraction: () => {},
    setInteractions: () => {},
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Mock fetch that only answers /api/interactions; any other URL is a hard failure. */
function stubInteractionsFetch(
  handler: () => Response | Promise<Response>
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url !== INTERACTIONS_URL) throw new Error(`Unexpected fetch: ${url}`);
    return handler();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// The thread store is a module-level singleton; reset the mutable slices we
// touch and swap markSourceHydrated + createThread for fresh spies before every
// test so call counts and thread state never leak between cases. createThread
// still delegates to the real implementation so threads are genuinely created.
const realCreateThread = useThreadStore.getState().createThread;
let markSourceHydrated: ReturnType<typeof vi.fn>;
let createThread: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.restoreAllMocks();
  markSourceHydrated = vi.fn();
  createThread = vi.fn(realCreateThread);
  useThreadStore.setState({
    threads: new Map(),
    messages: new Map(),
    markSourceHydrated,
    createThread,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useAttentionSync', () => {
  it('hydrates non-resolved interactions into attention threads and skips resolved ones', async () => {
    stubInteractionsFetch(() =>
      jsonResponse([
        makeInteraction({ id: 'int-open', issueId: 'ENG-7', reasons: ['ambiguous-spec'] }),
        makeInteraction({ id: 'int-done', status: 'resolved' }),
      ])
    );

    renderHook(() => useAttentionSync(makeSocket([])));
    await waitFor(() => expect(markSourceHydrated).toHaveBeenCalled());

    const state = useThreadStore.getState();
    const open = state.threads.get('attn:int-open');
    expect(open).toBeDefined();
    expect(open?.type).toBe('attention');
    expect(open?.title).toBe('Attention: ENG-7');
    expect(open?.meta as AttentionMeta).toMatchObject({
      interactionId: 'int-open',
      issueId: 'ENG-7',
      reasons: ['ambiguous-spec'],
    });

    // The resolved interaction is filtered out before any thread is created.
    expect(state.threads.has('attn:int-done')).toBe(false);
    expect(state.threads.size).toBe(1);
  });

  it('creates attention threads for live WebSocket interactions and dedupes repeats across re-renders', async () => {
    stubInteractionsFetch(() => jsonResponse([]));

    const { rerender } = renderHook(({ socket }) => useAttentionSync(socket), {
      initialProps: { socket: makeSocket([makeInteraction({ id: 'ws-1' })]) },
    });
    await waitFor(() => expect(useThreadStore.getState().threads.has('attn:ws-1')).toBe(true));

    // A new socket state that repeats ws-1 and adds ws-2 (fresh array reference
    // so the effect's dependency actually changes).
    rerender({
      socket: makeSocket([makeInteraction({ id: 'ws-1' }), makeInteraction({ id: 'ws-2' })]),
    });
    await waitFor(() => expect(useThreadStore.getState().threads.has('attn:ws-2')).toBe(true));

    // ws-1 is created exactly once despite appearing in both renders; ws-2 once.
    const attentionCreates = createThread.mock.calls.filter(([type]) => type === 'attention');
    expect(attentionCreates).toHaveLength(2);
    expect(useThreadStore.getState().threads.size).toBe(2);
  });

  it('deduplicates an interaction seen from the initial fetch against the live socket', async () => {
    // Both the fetch payload and the socket carry the same id; the shared
    // seenIds guard must ensure it is only ever created once.
    stubInteractionsFetch(() => jsonResponse([makeInteraction({ id: 'shared' })]));

    renderHook(() => useAttentionSync(makeSocket([makeInteraction({ id: 'shared' })])));
    await waitFor(() => expect(markSourceHydrated).toHaveBeenCalled());

    const attentionCreates = createThread.mock.calls.filter(([type]) => type === 'attention');
    expect(attentionCreates).toHaveLength(1);
    expect(useThreadStore.getState().threads.size).toBe(1);
    expect(useThreadStore.getState().threads.has('attn:shared')).toBe(true);
  });

  it('marks the attention source hydrated when the endpoint responds non-OK', async () => {
    stubInteractionsFetch(() => jsonResponse(null, 500));

    renderHook(() => useAttentionSync(makeSocket([])));
    await waitFor(() => expect(markSourceHydrated).toHaveBeenCalled());

    expect(useThreadStore.getState().threads.size).toBe(0);
  });

  it('marks hydrated and swallows a rejected fetch', async () => {
    stubInteractionsFetch(() => Promise.reject(new Error('network down')));

    renderHook(() => useAttentionSync(makeSocket([])));
    await waitFor(() => expect(markSourceHydrated).toHaveBeenCalled());

    expect(useThreadStore.getState().threads.size).toBe(0);
  });

  it('fetches /api/interactions exactly once across re-renders', async () => {
    const fetchMock = stubInteractionsFetch(() => jsonResponse([makeInteraction({ id: 'once' })]));

    const { rerender } = renderHook(({ socket }) => useAttentionSync(socket), {
      initialProps: { socket: makeSocket([]) },
    });
    await waitFor(() => expect(markSourceHydrated).toHaveBeenCalled());

    rerender({ socket: makeSocket([]) });
    rerender({ socket: makeSocket([]) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(INTERACTIONS_URL);
  });
});
