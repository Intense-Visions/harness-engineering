import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Streams } from '../../../src/client/pages/Streams';
import { useThreadStore } from '../../../src/client/stores/threadStore';
import type { AgentMeta } from '../../../src/client/types/thread';

// --- react-router: fully mock useNavigate (the only router API Streams uses) --
const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

// --- fixtures ---------------------------------------------------------------
const TURN_COUNT = 7;
const INPUT_TOKENS = 1200;
const OUTPUT_TOKENS = 3400;
// 1200 + 3400 = 4600 → formatTokens → "4.6k"
const EXPECTED_TOKENS_LABEL = '4.6k';
const DURATION_MS = 125_000; // 125s → 2m 5s
const EXPECTED_DURATION_LABEL = '2m 5s';
const HOURS_AGO = 3; // → formatTimeAgo → "3h ago"

type Attempt = {
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
};

function makeAttempt(overrides: Partial<Attempt> = {}): Attempt {
  const startedAt = new Date(Date.now() - HOURS_AGO * 60 * 60 * 1000).toISOString();
  return {
    attempt: 1,
    startedAt,
    endedAt: '2026-07-20T00:00:00.000Z',
    outcome: 'normal',
    stats: {
      durationMs: DURATION_MS,
      inputTokens: INPUT_TOKENS,
      outputTokens: OUTPUT_TOKENS,
      turnCount: TURN_COUNT,
      toolsCalled: [],
      filesTouched: [],
    },
    ...overrides,
  };
}

interface StreamSessionFixture {
  issueId: string;
  externalId: number | string | null;
  identifier: string;
  title?: string;
  attempts: Attempt[];
  pr: { number: number; linkedAt: string; status: string } | null;
  highlights: null;
}

function makeSession(overrides: Partial<StreamSessionFixture> = {}): StreamSessionFixture {
  return {
    issueId: 'issue-1',
    externalId: 101,
    identifier: 'ORG-101',
    title: 'Recorded agent run',
    attempts: [makeAttempt()],
    pr: null,
    highlights: null,
    ...overrides,
  };
}

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function installFetch(impl: () => Response): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() => Promise.resolve(impl()));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  mockNavigate.mockReset();
  // Reset the singleton zustand store to a clean slate between tests.
  useThreadStore.setState({ threads: new Map(), activeThreadId: null, lastThreadId: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Streams page', () => {
  it('shows the loading state before the first fetch resolves', async () => {
    installFetch(() => res([]));
    render(<Streams />);

    // Synchronous first render: loading=true, no sessions yet.
    expect(screen.getByText(/Loading streams/i)).toBeDefined();

    // Flush the pending fetch so React state settles (avoids act warnings).
    await waitFor(() => expect(screen.queryByText(/Loading streams/i)).toBeNull());
  });

  it('shows the empty state when the API returns no sessions', async () => {
    installFetch(() => res([]));
    render(<Streams />);

    await waitFor(() => {
      expect(screen.getByText(/No recorded streams yet/i)).toBeDefined();
    });
  });

  it('renders a 404 as the "orchestrator not running" hint', async () => {
    installFetch(() => res({ error: 'nope' }, 404));
    render(<Streams />);

    await waitFor(() => {
      expect(screen.getByText(/Orchestrator not running/i)).toBeDefined();
    });
  });

  it('renders a non-connectivity HTTP error verbatim', async () => {
    installFetch(() => res({ error: 'boom' }, 500));
    render(<Streams />);

    await waitFor(() => {
      expect(screen.getByText('HTTP 500')).toBeDefined();
    });
    // The connectivity-specific hint must NOT appear for a generic 500.
    expect(screen.queryByText(/Orchestrator not running/i)).toBeNull();
  });

  it('renders a session row with formatted tokens, turns, duration, and age', async () => {
    installFetch(() => res([makeSession()]));
    render(<Streams />);

    await waitFor(() => {
      expect(screen.getByText('Recorded agent run')).toBeDefined();
    });
    // Identifier column.
    expect(screen.getByText('ORG-101')).toBeDefined();
    // Outcome badge.
    expect(screen.getByText('normal')).toBeDefined();
    // Pure formatting helpers — deterministic from the fixture stats.
    expect(screen.getByText(`${TURN_COUNT} turns`)).toBeDefined();
    expect(screen.getByText(EXPECTED_TOKENS_LABEL)).toBeDefined();
    expect(screen.getByText(EXPECTED_DURATION_LABEL)).toBeDefined();
    expect(screen.getByText(`${HOURS_AGO}h ago`)).toBeDefined();
    // Recorded-session count (single node holds the composed label).
    expect(
      screen.getByText(
        (_content, el) => el?.tagName === 'SPAN' && el.textContent === '1 recorded session'
      )
    ).toBeDefined();
  });

  it('falls back to the identifier when a session has no title', async () => {
    installFetch(() => res([makeSession({ title: undefined, identifier: 'ORG-777' })]));
    render(<Streams />);

    await waitFor(() => {
      // Both the title cell and the identifier cell render "ORG-777".
      expect(screen.getAllByText('ORG-777').length).toBe(2);
    });
  });

  it('shows a "running" badge for a session whose last attempt has not ended', async () => {
    installFetch(() =>
      res([makeSession({ attempts: [makeAttempt({ endedAt: null, outcome: null })] })])
    );
    render(<Streams />);

    await waitFor(() => {
      expect(screen.getByText('running')).toBeDefined();
    });
  });

  it('creates an agent thread and navigates when a row is clicked', async () => {
    installFetch(() => res([makeSession()]));
    render(<Streams />);

    await waitFor(() => expect(screen.getByText('Recorded agent run')).toBeDefined());

    fireEvent.click(screen.getByText('Recorded agent run'));

    // deriveThreadId('agent', {issueId:'issue-1'}) === 'agent:issue-1'.
    const expectedThreadId = 'agent:issue-1';
    expect(mockNavigate).toHaveBeenCalledWith(`/t/${expectedThreadId}`);

    const state = useThreadStore.getState();
    expect(state.activeThreadId).toBe(expectedThreadId);

    const thread = state.threads.get(expectedThreadId);
    expect(thread).toBeDefined();
    expect(thread!.type).toBe('agent');
    expect((thread!.meta as AgentMeta).issueId).toBe('issue-1');
    // Last attempt ended → thread is marked completed by findOrCreateAgentThread.
    expect(thread!.status).toBe('completed');
  });

  it('marks a still-running session thread as active (not completed)', async () => {
    installFetch(() =>
      res([makeSession({ attempts: [makeAttempt({ endedAt: null, outcome: null })] })])
    );
    render(<Streams />);

    await waitFor(() => expect(screen.getByText('Recorded agent run')).toBeDefined());

    fireEvent.click(screen.getByText('Recorded agent run'));

    const thread = useThreadStore.getState().threads.get('agent:issue-1');
    expect(thread).toBeDefined();
    // isRunning branch skips the updateThread(completed) call → default 'active'.
    expect(thread!.status).toBe('active');
    expect((thread!.meta as AgentMeta).phase).toBe('running');
  });

  it('reuses an existing agent thread for the same issue instead of creating a new one', async () => {
    // Pre-seed a thread for the same issueId.
    const existing = useThreadStore.getState().createThread('agent', {
      issueId: 'issue-1',
      identifier: 'ORG-101',
      phase: 'completed',
      issueTitle: 'Pre-existing thread',
      issueDescription: null,
      startedAt: '2026-07-19T00:00:00.000Z',
      backendName: null,
    } satisfies AgentMeta);
    const countBefore = useThreadStore.getState().threads.size;

    installFetch(() => res([makeSession()]));
    render(<Streams />);

    await waitFor(() => expect(screen.getByText('Recorded agent run')).toBeDefined());

    fireEvent.click(screen.getByText('Recorded agent run'));

    expect(mockNavigate).toHaveBeenCalledWith(`/t/${existing.id}`);
    // No additional thread was created.
    expect(useThreadStore.getState().threads.size).toBe(countBefore);
  });
});
