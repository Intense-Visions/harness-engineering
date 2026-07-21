import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { AgentThreadView } from '../../../../src/client/components/threads/AgentThreadView';
import { AgentEventsContext } from '../../../../src/client/components/layout/ChatLayout';
import { useThreadStore } from '../../../../src/client/stores/threadStore';
import type { Thread, AgentMeta } from '../../../../src/client/types/thread';
import type { ContentBlock } from '../../../../src/client/types/chat';
import type {
  UseStreamReplayResult,
  StreamManifest,
} from '../../../../src/client/hooks/useStreamReplay';
import type { OrchestratorSocketState } from '../../../../src/client/hooks/useOrchestratorSocket';
import type {
  OrchestratorSnapshot,
  RunningAgent,
  AgentSession,
} from '../../../../src/client/types/orchestrator';

// ── Hoisted mutable holder so the (hoisted) vi.mock factories can read the
//    per-test hook return values at render time without TDZ issues.
const hookState = vi.hoisted(() => ({
  streamReplay: undefined as unknown,
  socket: undefined as unknown,
}));

// ── framer-motion drives the running-status pulse (repeat: Infinity). Replace
//    it with plain DOM so nothing schedules real animation frames.
vi.mock('framer-motion', () => {
  const strip = (props: Record<string, unknown>) => {
    const { initial, animate, exit, transition, whileHover, whileTap, layout, ...rest } = props;
    void initial;
    void animate;
    void exit;
    void transition;
    void whileHover;
    void whileTap;
    void layout;
    return rest;
  };
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) => (props: Record<string, unknown>) =>
        React.createElement(tag, strip(props), props.children as React.ReactNode),
    }
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// ── Stub heavy leaf components so the test targets AgentThreadView's own
//    orchestration (block merge, stats derivation, view routing), not internals.
vi.mock('../../../../src/client/components/chat/NeuralOrganism', () => ({
  NeuralOrganism: () => <div data-testid="neural-organism" />,
}));

// The MessageStream stub surfaces the merged block payload it receives so the
// test can assert the merge result (count + order) without reaching into React.
vi.mock('../../../../src/client/components/chat/MessageStream', () => ({
  MessageStream: ({
    messages,
    streaming,
  }: {
    messages: Array<{ blocks: Array<{ text?: string }> }>;
    streaming: boolean;
  }) => {
    const blocks = messages[0]?.blocks ?? [];
    return (
      <div
        data-testid="message-stream"
        data-message-count={String(messages.length)}
        data-block-count={String(blocks.length)}
        data-first-text={blocks[0]?.text ?? ''}
        data-last-text={blocks[blocks.length - 1]?.text ?? ''}
        data-streaming={String(streaming)}
      />
    );
  },
}));

// ── Network/socket seams: fully mocked, return values swapped per test.
vi.mock('../../../../src/client/hooks/useStreamReplay', () => ({
  useStreamReplay: () => hookState.streamReplay,
}));
vi.mock('../../../../src/client/hooks/useOrchestratorSocket', () => ({
  useOrchestratorSocket: () => hookState.socket,
}));

// ── Fixtures. Every expected assertion is DERIVED from these constants so the
//    checks track the fixture rather than pasting magic numbers.
const ISSUE_ID = 'agent-issue-1';
const THREAD_ID = `agent:${ISSUE_ID}`;

const META: AgentMeta = {
  issueId: ISSUE_ID,
  identifier: 'ENG-42',
  phase: 'execute',
  issueTitle: 'Wire the thing',
  issueDescription: 'A detailed description of the work under way.',
  startedAt: '2026-07-20T10:00:00.000Z',
  backendName: 'meta-backend',
};

const RECORDED_BLOCKS: ContentBlock[] = [
  { kind: 'text', text: 'recorded-block-1' },
  { kind: 'text', text: 'recorded-block-2' },
];
const LIVE_BLOCKS: ContentBlock[] = [{ kind: 'text', text: 'live-block-1' }];

const SESSION: AgentSession = {
  backendName: 'session-backend',
  inputTokens: 100,
  outputTokens: 40,
  totalTokens: 140,
  turnCount: 7,
  lastMessage: null,
};

const ATTEMPT_STATS = {
  durationMs: 5_000,
  inputTokens: 10,
  outputTokens: 5,
  turnCount: 2,
  toolsCalled: [] as string[],
  filesTouched: [] as string[],
};

const MANIFEST_PR = { number: 123, linkedAt: '2026-07-20T11:00:00.000Z', status: 'open' };

const LOADING_TEXT = 'Loading stream history...';
const EMPTY_COMPLETED_TEXT = 'No activity recorded for this session.';
const EMPTY_RUNNING_TEXT = 'Agent is working...';

function makeAgentThread(
  status: Thread['status'] = 'active',
  metaOverrides: Partial<AgentMeta> = {}
): Thread {
  return {
    id: THREAD_ID,
    type: 'agent',
    title: 'Agent: Wire the thing',
    status,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    avatar: 'organism',
    unread: false,
    meta: { ...META, ...metaOverrides },
  };
}

function makeManifest(overrides: Partial<StreamManifest> = {}): StreamManifest {
  return {
    issueId: ISSUE_ID,
    externalId: 42,
    identifier: META.identifier,
    title: META.issueTitle,
    attempts: [
      {
        attempt: 1,
        startedAt: '2026-07-20T10:00:00.000Z',
        endedAt: '2026-07-20T10:05:00.000Z',
        outcome: 'success',
        stats: ATTEMPT_STATS,
      },
    ],
    pr: MANIFEST_PR,
    highlights: null,
    ...overrides,
  };
}

function makeRunningAgent(session: AgentSession | null): RunningAgent {
  return {
    issueId: ISSUE_ID,
    identifier: META.identifier,
    phase: META.phase,
    startedAt: META.startedAt,
    workspacePath: '/tmp/ws',
    attempt: 1,
    issue: {
      identifier: META.identifier,
      title: META.issueTitle,
      description: null,
      blockedBy: [],
    },
    session,
  };
}

function makeSnapshot(running: OrchestratorSnapshot['running']): OrchestratorSnapshot {
  return {
    running,
    retryAttempts: [],
    claimed: [],
    tokenTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    maxConcurrentAgents: 4,
    globalCooldownUntilMs: null,
    recentRequestTimestamps: [],
    recentInputTokens: [],
    recentOutputTokens: [],
    maxRequestsPerMinute: 60,
    maxRequestsPerSecond: 5,
    maxInputTokensPerMinute: 1000,
    maxOutputTokensPerMinute: 1000,
  };
}

function setStreamReplay(overrides: Partial<UseStreamReplayResult> = {}): void {
  hookState.streamReplay = {
    manifest: null,
    recordedBlocks: [],
    loading: false,
    error: null,
    ...overrides,
  } satisfies UseStreamReplayResult;
}

function setSocket(snapshot: OrchestratorSnapshot | null): void {
  hookState.socket = { snapshot } as unknown as OrchestratorSocketState;
}

function renderView(thread: Thread, liveBlocks: ContentBlock[] = []): void {
  render(
    <AgentEventsContext.Provider value={{ [ISSUE_ID]: liveBlocks }}>
      <AgentThreadView thread={thread} />
    </AgentEventsContext.Provider>
  );
}

function resetStore(): void {
  useThreadStore.setState({
    threads: new Map(),
    messages: new Map(),
    panelState: new Map(),
    activeThreadId: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  // Neutral defaults: no history, no live socket snapshot.
  setStreamReplay();
  setSocket(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AgentThreadView header + view routing', () => {
  it('renders the header with the thread title, identifier, phase, and a Running badge when active', () => {
    renderView(makeAgentThread('active'));

    expect(screen.getByText('Agent: Wire the thing')).toBeDefined();
    expect(screen.getByText(META.identifier)).toBeDefined();
    expect(screen.getByText(META.phase)).toBeDefined();
    expect(screen.getByText('Running')).toBeDefined();
    expect(screen.queryByText('Completed')).toBeNull();
  });

  it('shows a Completed badge when the thread is not active', () => {
    renderView(makeAgentThread('completed'));

    expect(screen.getByText('Completed')).toBeDefined();
    expect(screen.queryByText('Running')).toBeNull();
  });

  it('renders the issue description block when present and omits it when null', () => {
    const { unmount } = render(
      <AgentEventsContext.Provider value={{}}>
        <AgentThreadView thread={makeAgentThread('active')} />
      </AgentEventsContext.Provider>
    );
    expect(screen.getByText(META.issueDescription as string)).toBeDefined();
    unmount();

    renderView(makeAgentThread('active', { issueDescription: null }));
    expect(screen.queryByText(META.issueDescription as string)).toBeNull();
  });

  it('renders the loading placeholder and no message stream while history is loading', () => {
    setStreamReplay({ loading: true });

    renderView(makeAgentThread('active'), LIVE_BLOCKS);

    expect(screen.getByText(LOADING_TEXT)).toBeDefined();
    expect(screen.queryByTestId('message-stream')).toBeNull();
  });

  it('shows the running empty-state when there are no blocks and the agent is active', () => {
    renderView(makeAgentThread('active'), []);

    expect(screen.getByText(EMPTY_RUNNING_TEXT)).toBeDefined();
    expect(screen.queryByTestId('message-stream')).toBeNull();
  });

  it('shows the completed empty-state when there are no blocks and the agent is done', () => {
    renderView(makeAgentThread('completed'), []);

    expect(screen.getByText(EMPTY_COMPLETED_TEXT)).toBeDefined();
    expect(screen.queryByText(EMPTY_RUNNING_TEXT)).toBeNull();
  });
});

describe('AgentThreadView block merge', () => {
  it('concatenates recorded history then live events, preserving order', () => {
    setStreamReplay({ recordedBlocks: RECORDED_BLOCKS });

    renderView(makeAgentThread('active'), LIVE_BLOCKS);

    const stream = screen.getByTestId('message-stream');
    // Single assistant message carrying every merged block.
    expect(stream.getAttribute('data-message-count')).toBe('1');
    expect(stream.getAttribute('data-block-count')).toBe(
      String(RECORDED_BLOCKS.length + LIVE_BLOCKS.length)
    );
    // Recorded history comes first, live events last.
    expect(stream.getAttribute('data-first-text')).toBe(RECORDED_BLOCKS[0]?.text);
    expect(stream.getAttribute('data-last-text')).toBe(LIVE_BLOCKS[LIVE_BLOCKS.length - 1]?.text);
    // streaming reflects the active status.
    expect(stream.getAttribute('data-streaming')).toBe('true');
  });

  it('uses only recorded history when there are no live events', () => {
    setStreamReplay({ recordedBlocks: RECORDED_BLOCKS });

    renderView(makeAgentThread('completed'), []);

    const stream = screen.getByTestId('message-stream');
    expect(stream.getAttribute('data-block-count')).toBe(String(RECORDED_BLOCKS.length));
    expect(stream.getAttribute('data-last-text')).toBe(
      RECORDED_BLOCKS[RECORDED_BLOCKS.length - 1]?.text
    );
    // Not active → not streaming.
    expect(stream.getAttribute('data-streaming')).toBe('false');
  });

  it('falls back to live events when there is no recorded history', () => {
    setStreamReplay({ recordedBlocks: [] });

    renderView(makeAgentThread('active'), LIVE_BLOCKS);

    const stream = screen.getByTestId('message-stream');
    expect(stream.getAttribute('data-block-count')).toBe(String(LIVE_BLOCKS.length));
    expect(stream.getAttribute('data-first-text')).toBe(LIVE_BLOCKS[0]?.text);
  });
});

describe('AgentThreadView stats derivation → thread store', () => {
  it('prefers live session stats and the latest attempt duration + manifest PR when running', async () => {
    setStreamReplay({ recordedBlocks: RECORDED_BLOCKS, manifest: makeManifest() });
    setSocket(makeSnapshot([[ISSUE_ID, makeRunningAgent(SESSION)]]));

    const thread = makeAgentThread('active');
    renderView(thread, LIVE_BLOCKS);

    await waitFor(() => {
      expect(useThreadStore.getState().panelState.get(thread.id)?.agentStats).toBeDefined();
    });
    const stats = useThreadStore.getState().panelState.get(thread.id)?.agentStats;

    expect(stats?.identifier).toBe(META.identifier);
    expect(stats?.phase).toBe(META.phase);
    // Session values win over meta / attempt fallbacks.
    expect(stats?.backendName).toBe(SESSION.backendName);
    expect(stats?.turnCount).toBe(SESSION.turnCount);
    expect(stats?.inputTokens).toBe(SESSION.inputTokens);
    expect(stats?.outputTokens).toBe(SESSION.outputTokens);
    expect(stats?.totalTokens).toBe(SESSION.totalTokens);
    // Duration comes from the latest attempt; PR from the manifest.
    expect(stats?.durationMs).toBe(ATTEMPT_STATS.durationMs);
    expect(stats?.pr).toEqual({ number: MANIFEST_PR.number, status: MANIFEST_PR.status });
    expect(stats?.startedAt).toBe(new Date(META.startedAt).getTime());
    expect(stats?.isRunning).toBe(true);
    expect(stats?.description).toBe(META.issueDescription);
  });

  it('falls back to the latest attempt stats and meta backend when there is no live session', async () => {
    setStreamReplay({ manifest: makeManifest() });
    setSocket(null);

    const thread = makeAgentThread('completed');
    renderView(thread, []);

    await waitFor(() => {
      expect(useThreadStore.getState().panelState.get(thread.id)?.agentStats).toBeDefined();
    });
    const stats = useThreadStore.getState().panelState.get(thread.id)?.agentStats;

    expect(stats?.backendName).toBe(META.backendName);
    expect(stats?.turnCount).toBe(ATTEMPT_STATS.turnCount);
    expect(stats?.inputTokens).toBe(ATTEMPT_STATS.inputTokens);
    expect(stats?.outputTokens).toBe(ATTEMPT_STATS.outputTokens);
    // totalTokens is derived from the attempt when no session total exists.
    expect(stats?.totalTokens).toBe(ATTEMPT_STATS.inputTokens + ATTEMPT_STATS.outputTokens);
    expect(stats?.durationMs).toBe(ATTEMPT_STATS.durationMs);
    expect(stats?.isRunning).toBe(false);
  });

  it('emits zeroed stats and a null PR/duration when there is neither a session nor a manifest', async () => {
    setStreamReplay({ manifest: null });
    setSocket(null);

    const thread = makeAgentThread('active');
    renderView(thread, []);

    await waitFor(() => {
      expect(useThreadStore.getState().panelState.get(thread.id)?.agentStats).toBeDefined();
    });
    const stats = useThreadStore.getState().panelState.get(thread.id)?.agentStats;

    expect(stats?.backendName).toBe(META.backendName);
    expect(stats?.turnCount).toBe(0);
    expect(stats?.inputTokens).toBe(0);
    expect(stats?.outputTokens).toBe(0);
    expect(stats?.totalTokens).toBe(0);
    expect(stats?.durationMs).toBeNull();
    expect(stats?.pr).toBeNull();
  });

  it('ignores a running entry whose id does not match this thread (no live session leak)', async () => {
    setStreamReplay({ manifest: makeManifest() });
    // Snapshot has a running agent, but for a different issue.
    setSocket(makeSnapshot([['some-other-issue', makeRunningAgent(SESSION)]]));

    const thread = makeAgentThread('active');
    renderView(thread, []);

    await waitFor(() => {
      expect(useThreadStore.getState().panelState.get(thread.id)?.agentStats).toBeDefined();
    });
    const stats = useThreadStore.getState().panelState.get(thread.id)?.agentStats;

    // No matching session → attempt/meta fallbacks, not SESSION's backend.
    expect(stats?.backendName).toBe(META.backendName);
    expect(stats?.turnCount).toBe(ATTEMPT_STATS.turnCount);
  });
});
