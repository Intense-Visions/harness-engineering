import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Orchestrator } from '../../../src/client/pages/Orchestrator';
import type { OrchestratorSnapshot } from '../../../src/client/types/orchestrator';

// Mock the hook
const mockHook = {
  snapshot: null as OrchestratorSnapshot | null,
  interactions: [],
  connected: false,
  removeInteraction: vi.fn(),
  setInteractions: vi.fn(),
};

vi.mock('../../../src/client/hooks/useOrchestratorSocket', () => ({
  useOrchestratorSocket: () => mockHook,
}));

beforeEach(() => {
  mockHook.snapshot = null;
  mockHook.connected = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeSnapshot(overrides?: Partial<OrchestratorSnapshot>): OrchestratorSnapshot {
  return {
    running: [],
    retryAttempts: [],
    claimed: [],
    tokenTotals: { inputTokens: 1000, outputTokens: 2000, totalTokens: 3000, secondsRunning: 120 },
    maxConcurrentAgents: 5,
    globalCooldownUntilMs: null,
    recentRequestTimestamps: [Date.now()],
    recentInputTokens: [{ timestamp: Date.now(), tokens: 500 }],
    recentOutputTokens: [{ timestamp: Date.now(), tokens: 300 }],
    maxRequestsPerMinute: 50,
    maxRequestsPerSecond: 2,
    maxInputTokensPerMinute: 80000,
    maxOutputTokensPerMinute: 40000,
    ...overrides,
  };
}

describe('Orchestrator (Agent Monitor) page', () => {
  it('shows connecting message when no snapshot', () => {
    render(<Orchestrator />);
    expect(screen.getByText(/Connecting to orchestrator/i)).toBeDefined();
  });

  it('shows rate limit section when snapshot present', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    render(<Orchestrator />);
    expect(screen.getByText('Rate Limits')).toBeDefined();
  });

  it('shows token totals', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    render(<Orchestrator />);
    expect(screen.getByText('Token Usage')).toBeDefined();
    expect(screen.getByText('1,000')).toBeDefined(); // inputTokens formatted
  });

  it('shows concurrency info', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    render(<Orchestrator />);
    expect(screen.getByText('Concurrency')).toBeDefined();
  });

  it('shows no agents message when running is empty', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    render(<Orchestrator />);
    expect(screen.getByText(/No active agents/i)).toBeDefined();
  });

  it('renders agent rows when agents are running', () => {
    mockHook.snapshot = makeSnapshot({
      running: [
        [
          'issue-1',
          {
            issueId: 'issue-1',
            identifier: 'fix-login-bug',
            phase: 'StreamingTurn',
            session: {
              backendName: 'local',
              totalTokens: 500,
              turnCount: 3,
              lastMessage: 'Working on it...',
            },
          },
        ],
      ],
    });
    mockHook.connected = true;
    render(<Orchestrator />);
    expect(screen.getByText('fix-login-bug')).toBeDefined();
    expect(screen.getByText('local')).toBeDefined();
    expect(screen.getByText('StreamingTurn')).toBeDefined();
  });

  it('shows COOLDOWN status when globalCooldownUntilMs is in the future', () => {
    mockHook.snapshot = makeSnapshot({ globalCooldownUntilMs: Date.now() + 60000 });
    mockHook.connected = true;
    render(<Orchestrator />);
    expect(screen.getByText('COOLDOWN')).toBeDefined();
  });
});
