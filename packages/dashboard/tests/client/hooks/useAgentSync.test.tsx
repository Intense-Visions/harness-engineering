import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAgentSync } from '../../../src/client/hooks/useAgentSync';
import { useThreadStore } from '../../../src/client/stores/threadStore';
import type { StreamManifest } from '../../../src/client/hooks/useStreamReplay';
import type { RunningAgent, OrchestratorSnapshot } from '../../../src/client/types/orchestrator';
import type { OrchestratorSocketState } from '../../../src/client/hooks/useOrchestratorSocket';
import type { AgentMeta } from '../../../src/client/types/thread';

const STREAMS_URL = '/api/streams';

/** A completed stream attempt with fully-populated stats (endedAt set => not running). */
function makeAttempt(
  overrides: Partial<StreamManifest['attempts'][number]> = {}
): StreamManifest['attempts'][number] {
  return {
    attempt: 1,
    startedAt: '2026-07-20T00:00:00.000Z',
    endedAt: '2026-07-20T00:05:00.000Z',
    outcome: 'success',
    stats: {
      durationMs: 300_000,
      inputTokens: 0,
      outputTokens: 0,
      turnCount: 0,
      toolsCalled: [],
      filesTouched: [],
    },
    ...overrides,
  };
}

/** A stable, valid StreamManifest; callers override only the fields under test. */
function makeManifest(overrides: Partial<StreamManifest> & { issueId: string }): StreamManifest {
  return {
    externalId: null,
    identifier: overrides.issueId,
    title: 'Some Issue',
    attempts: [makeAttempt()],
    pr: null,
    highlights: null,
    ...overrides,
  };
}

/** A stable, valid RunningAgent; callers override only the fields under test. */
function makeRunningAgent(overrides: Partial<RunningAgent> & { issueId: string }): RunningAgent {
  return {
    identifier: overrides.issueId,
    phase: 'brainstorm',
    startedAt: '2026-07-20T01:00:00.000Z',
    workspacePath: '/tmp/worktree',
    attempt: 1,
    issue: {
      identifier: overrides.issueId,
      title: 'Live Issue',
      description: 'live description',
      blockedBy: [],
    },
    session: null,
    ...overrides,
  };
}

/**
 * Build a socket whose only meaningful field is `snapshot.running`; the hook
 * reads nothing else. A fresh snapshot object per call is what re-triggers the
 * hook's `[socket.snapshot]` effect on rerender.
 */
function makeSocket(running: Array<[string, RunningAgent]>): OrchestratorSocketState {
  const snapshot = { running } as unknown as OrchestratorSnapshot;
  return { snapshot } as OrchestratorSocketState;
}

/** Empty socket — no live agents. */
function emptySocket(): OrchestratorSocketState {
  return makeSocket([]);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Mock fetch that only answers /api/streams; any other URL is a hard failure. */
function stubStreamsFetch(handler: () => Response | Promise<Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url !== STREAMS_URL) throw new Error(`Unexpected fetch: ${url}`);
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

describe('useAgentSync', () => {
  describe('historical seeding from /api/streams', () => {
    it('seeds a completed session as a completed agent thread and marks hydrated', async () => {
      stubStreamsFetch(() =>
        jsonResponse([
          makeManifest({ issueId: 'I-100', identifier: 'ISS-100', title: 'Done Work' }),
        ])
      );

      renderHook(() => useAgentSync(emptySocket()));
      await waitFor(() => expect(markSourceHydrated).toHaveBeenCalledTimes(1));

      const state = useThreadStore.getState();
      const thread = state.threads.get('agent:I-100');
      expect(thread).toBeDefined();
      expect(thread?.type).toBe('agent');
      expect(thread?.status).toBe('completed');
      expect(thread?.title).toBe('Done Work');
      expect(thread?.meta).toMatchObject({
        issueId: 'I-100',
        phase: 'completed',
        backendName: null,
      });
    });

    it('skips a still-running session (last attempt has no endedAt)', async () => {
      stubStreamsFetch(() =>
        jsonResponse([
          makeManifest({
            issueId: 'I-200',
            attempts: [makeAttempt({ endedAt: null, outcome: null })],
          }),
        ])
      );

      renderHook(() => useAgentSync(emptySocket()));
      await waitFor(() => expect(markSourceHydrated).toHaveBeenCalledTimes(1));

      // Running sessions are left for live sync — no completed thread is seeded.
      expect(useThreadStore.getState().threads.has('agent:I-200')).toBe(false);
    });

    it('does not seed over an agent thread that already exists for the issue', async () => {
      const store = useThreadStore.getState();
      store.createThread('agent', {
        issueId: 'I-300',
        identifier: 'ISS-300',
        phase: 'execute',
        issueTitle: 'Original',
        issueDescription: null,
        startedAt: '2026-07-20T00:00:00.000Z',
        backendName: 'claude',
      } satisfies AgentMeta);

      stubStreamsFetch(() =>
        jsonResponse([makeManifest({ issueId: 'I-300', title: 'From Disk' })])
      );

      // Keep I-300 in the running set so live sync's completion sweep leaves it
      // active — this isolates the seed's skip-existing behavior under test.
      const running = makeRunningAgent({ issueId: 'I-300', phase: 'execute' });
      renderHook(() => useAgentSync(makeSocket([['I-300', running]])));
      await waitFor(() => expect(markSourceHydrated).toHaveBeenCalledTimes(1));

      const thread = useThreadStore.getState().threads.get('agent:I-300');
      // Existing thread is untouched: title, status and phase all preserved,
      // and no duplicate thread is created for the same issue.
      expect(thread?.title).toBe('Original');
      expect(thread?.status).toBe('active');
      expect((thread?.meta as AgentMeta).phase).toBe('execute');
      expect(useThreadStore.getState().threads.size).toBe(1);
    });

    it('marks hydrated without seeding when /api/streams responds non-OK', async () => {
      stubStreamsFetch(() => jsonResponse(null, 500));

      renderHook(() => useAgentSync(emptySocket()));
      await waitFor(() => expect(markSourceHydrated).toHaveBeenCalledTimes(1));

      expect(useThreadStore.getState().threads.size).toBe(0);
    });

    it('seeds historical sessions exactly once across rerenders', async () => {
      const fetchMock = stubStreamsFetch(() => jsonResponse([makeManifest({ issueId: 'I-400' })]));

      const { rerender } = renderHook(({ socket }) => useAgentSync(socket), {
        initialProps: { socket: emptySocket() },
      });
      await waitFor(() => expect(markSourceHydrated).toHaveBeenCalledTimes(1));

      rerender({ socket: emptySocket() });
      rerender({ socket: emptySocket() });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(STREAMS_URL);
    });
  });

  describe('live sync from the orchestrator snapshot', () => {
    it('creates an active agent thread for a running agent in the snapshot', async () => {
      stubStreamsFetch(() => jsonResponse([]));

      const agent = makeRunningAgent({
        issueId: 'I-500',
        phase: 'plan',
        issue: {
          identifier: 'ISS-500',
          title: 'Ship it',
          description: 'the description',
          blockedBy: [],
        },
        session: {
          backendName: 'qwen3-coder',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          turnCount: 0,
          lastMessage: null,
        },
      });

      renderHook(() => useAgentSync(makeSocket([['I-500', agent]])));

      const thread = useThreadStore.getState().threads.get('agent:I-500');
      expect(thread).toBeDefined();
      expect(thread?.status).toBe('active');
      expect(thread?.title).toBe('Ship it');
      expect(thread?.meta).toMatchObject({
        issueId: 'I-500',
        phase: 'plan',
        issueDescription: 'the description',
        backendName: 'qwen3-coder',
      });
    });

    it('updates phase and backendName when a known agent advances in a later snapshot', async () => {
      stubStreamsFetch(() => jsonResponse([]));

      const first = makeRunningAgent({ issueId: 'I-600', phase: 'brainstorm', session: null });
      const { rerender } = renderHook(({ socket }) => useAgentSync(socket), {
        initialProps: { socket: makeSocket([['I-600', first]]) },
      });

      expect((useThreadStore.getState().threads.get('agent:I-600')?.meta as AgentMeta).phase).toBe(
        'brainstorm'
      );

      const advanced = makeRunningAgent({
        issueId: 'I-600',
        phase: 'execute',
        session: {
          backendName: 'claude',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          turnCount: 0,
          lastMessage: null,
        },
      });
      act(() => rerender({ socket: makeSocket([['I-600', advanced]]) }));

      const meta = useThreadStore.getState().threads.get('agent:I-600')?.meta as AgentMeta;
      expect(meta.phase).toBe('execute');
      expect(meta.backendName).toBe('claude');
    });

    it('completes an active agent thread once its issue drops out of the running set', async () => {
      stubStreamsFetch(() => jsonResponse([]));

      const agent = makeRunningAgent({ issueId: 'I-700', phase: 'execute' });
      const { rerender } = renderHook(({ socket }) => useAgentSync(socket), {
        initialProps: { socket: makeSocket([['I-700', agent]]) },
      });
      expect(useThreadStore.getState().threads.get('agent:I-700')?.status).toBe('active');

      // Next snapshot no longer lists the agent as running.
      act(() => rerender({ socket: emptySocket() }));

      expect(useThreadStore.getState().threads.get('agent:I-700')?.status).toBe('completed');
    });
  });
});
