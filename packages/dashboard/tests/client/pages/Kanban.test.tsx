import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Kanban } from '../../../src/client/pages/Kanban';
import type { OrchestratorSnapshot, RunningAgent } from '../../../src/client/types/orchestrator';

const mockHook = {
  snapshot: null as OrchestratorSnapshot | null,
  interactions: [],
  connected: true,
  agentEvents: {} as Record<string, unknown[]>,
  maintenanceEvent: null,
  localModelStatuses: [] as unknown[],
  removeInteraction: vi.fn(),
  setInteractions: vi.fn(),
};

vi.mock('../../../src/client/hooks/useOrchestratorSocket', () => ({
  useOrchestratorSocket: () => mockHook,
}));

function makeAgent(overrides: Partial<RunningAgent> = {}): RunningAgent {
  return {
    issueId: 'i-run',
    identifier: 'RUN-1',
    phase: 'StreamingTurn',
    startedAt: '2026-06-25T00:00:00.000Z',
    workspacePath: '/tmp/wt/RUN-1',
    attempt: 1,
    issue: {
      identifier: 'RUN-1',
      title: 'Running task title',
      description: null,
      blockedBy: [],
    },
    session: {
      backendName: 'local',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      turnCount: 1,
      lastMessage: null,
    },
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<OrchestratorSnapshot> = {}): OrchestratorSnapshot {
  return {
    running: [],
    retryAttempts: [],
    claimed: [],
    tokenTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    maxConcurrentAgents: 5,
    globalCooldownUntilMs: null,
    recentRequestTimestamps: [],
    recentInputTokens: [],
    recentOutputTokens: [],
    maxRequestsPerMinute: 50,
    maxRequestsPerSecond: 2,
    maxInputTokensPerMinute: 0,
    maxOutputTokensPerMinute: 0,
    ...overrides,
  };
}

function renderKanban() {
  return render(
    <MemoryRouter>
      <Kanban />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockHook.snapshot = null;
  mockHook.connected = true;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Kanban page', () => {
  it('renders a running agent in the in-progress lane', () => {
    mockHook.snapshot = makeSnapshot({ running: [['i-run', makeAgent()]] });
    renderKanban();
    const lane = screen.getByTestId('lane-in-progress');
    expect(lane.textContent).toContain('Running task title');
    expect(lane.textContent).toContain('local');
  });

  it('renders a retry entry in the blocked lane with its reason', () => {
    mockHook.snapshot = makeSnapshot({
      retryAttempts: [
        [
          'i-retry',
          { issueId: 'i-retry', identifier: 'RETRY-1', attempt: 2, dueAtMs: 0, error: 'boom' },
        ],
      ],
    });
    renderKanban();
    const lane = screen.getByTestId('lane-blocked');
    expect(lane.textContent).toContain('boom');
  });

  it('shows an empty state when no work is in flight', () => {
    mockHook.snapshot = makeSnapshot();
    renderKanban();
    expect(screen.getByText('No work in flight.')).toBeDefined();
  });

  it('shows a disconnected state when there is no snapshot', () => {
    mockHook.snapshot = null;
    mockHook.connected = false;
    renderKanban();
    expect(screen.getByText('Orchestrator not connected.')).toBeDefined();
  });
});
