import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Orchestrator } from '../../../src/client/pages/Orchestrator';
import type { OrchestratorSnapshot } from '../../../src/client/types/orchestrator';

// Mock the hook. Spec 2 SC39 widens this to `localModelStatuses[]`
// (per-backend NamedLocalModelStatus list, merged by backendName).
const mockHook = {
  snapshot: null as OrchestratorSnapshot | null,
  interactions: [],
  connected: false,
  agentEvents: {} as Record<string, unknown[]>,
  maintenanceEvent: null,
  localModelStatuses:
    [] as import('../../../src/client/types/orchestrator').NamedLocalModelStatus[],
  removeInteraction: vi.fn(),
  setInteractions: vi.fn(),
};

vi.mock('../../../src/client/hooks/useOrchestratorSocket', () => ({
  useOrchestratorSocket: () => mockHook,
}));

beforeEach(() => {
  mockHook.snapshot = null;
  mockHook.connected = false;
  mockHook.localModelStatuses = [];
});

const UNHEALTHY_BASE = {
  available: false as const,
  resolved: null,
  configured: ['gemma-4-e4b', 'qwen3:8b'],
  detected: [] as string[],
  lastProbeAt: '2026-04-30T12:00:00.000Z',
  lastError: 'fetch failed',
  warnings: ['No configured candidate is loaded.'],
};

const HEALTHY_BASE = {
  available: true as const,
  resolved: 'gemma-4-e4b',
  configured: ['gemma-4-e4b'],
  detected: ['gemma-4-e4b'],
  lastProbeAt: '2026-04-30T12:00:00.000Z',
  lastError: null,
  warnings: [] as string[],
};

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
    render(
      <MemoryRouter>
        <Orchestrator />
      </MemoryRouter>
    );
    expect(screen.getByText(/Connecting to orchestrator/i)).toBeDefined();
  });

  it('shows rate limit section when snapshot present', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    render(
      <MemoryRouter>
        <Orchestrator />
      </MemoryRouter>
    );
    expect(screen.getByText('Rate Limits')).toBeDefined();
  });

  it('shows token totals', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    render(
      <MemoryRouter>
        <Orchestrator />
      </MemoryRouter>
    );
    expect(screen.getByText('Token Usage')).toBeDefined();
    expect(screen.getByText('1,000')).toBeDefined(); // inputTokens formatted
  });

  it('shows concurrency info', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    render(
      <MemoryRouter>
        <Orchestrator />
      </MemoryRouter>
    );
    expect(screen.getByText('Concurrency')).toBeDefined();
  });

  it('shows no agents message when running is empty', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    render(
      <MemoryRouter>
        <Orchestrator />
      </MemoryRouter>
    );
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
    render(
      <MemoryRouter>
        <Orchestrator />
      </MemoryRouter>
    );
    // Identifier appears in both the agent card and the snapshot table; use getAllByText
    expect(screen.getAllByText('fix-login-bug').length).toBeGreaterThan(0);
    expect(screen.getAllByText('local').length).toBeGreaterThan(0);
    expect(screen.getAllByText('StreamingTurn').length).toBeGreaterThan(0);
  });

  it('shows COOLDOWN status when globalCooldownUntilMs is in the future', () => {
    mockHook.snapshot = makeSnapshot({ globalCooldownUntilMs: Date.now() + 60000 });
    mockHook.connected = true;
    render(
      <MemoryRouter>
        <Orchestrator />
      </MemoryRouter>
    );
    expect(screen.getByText('COOLDOWN')).toBeDefined();
  });

  it('renders LocalModelBanner when local model is unavailable (OT5 / SC19)', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    mockHook.localModelStatuses = [
      { ...UNHEALTHY_BASE, backendName: 'local', endpoint: 'http://localhost:1234/v1' },
    ];
    render(
      <MemoryRouter>
        <Orchestrator />
      </MemoryRouter>
    );
    const banner = screen.getByRole('alert');
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain('Local model unavailable');
    expect(banner.textContent).toContain('gemma-4-e4b');
    expect(banner.textContent).toContain('qwen3:8b');
    expect(banner.textContent).toContain('none detected');
    expect(banner.textContent).toContain('fetch failed');
    // SC40: banner labels include backendName + endpoint.
    expect(banner.textContent).toContain('local');
    expect(banner.textContent).toContain('http://localhost:1234/v1');
  });

  it('does not render LocalModelBanner when status.available is true (OT6)', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    mockHook.localModelStatuses = [
      { ...HEALTHY_BASE, backendName: 'local', endpoint: 'http://localhost:1234/v1' },
    ];
    render(
      <MemoryRouter>
        <Orchestrator />
      </MemoryRouter>
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not render LocalModelBanner when localModelStatuses is empty', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    mockHook.localModelStatuses = [];
    render(
      <MemoryRouter>
        <Orchestrator />
      </MemoryRouter>
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders one banner per unhealthy backend (SC40)', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    mockHook.localModelStatuses = [
      { ...UNHEALTHY_BASE, backendName: 'local-a', endpoint: 'http://localhost:1234/v1' },
      { ...UNHEALTHY_BASE, backendName: 'pi-2', endpoint: 'http://192.168.1.50:1234/v1' },
    ];
    render(
      <MemoryRouter>
        <Orchestrator />
      </MemoryRouter>
    );
    const banners = screen.getAllByRole('alert');
    expect(banners).toHaveLength(2);
    expect(banners[0]?.textContent).toContain('local-a');
    expect(banners[0]?.textContent).toContain('http://localhost:1234/v1');
    expect(banners[1]?.textContent).toContain('pi-2');
    expect(banners[1]?.textContent).toContain('http://192.168.1.50:1234/v1');
  });

  it('renders only banners for unhealthy backends (mixed health) (SC40)', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    mockHook.localModelStatuses = [
      { ...UNHEALTHY_BASE, backendName: 'local-a', endpoint: 'http://localhost:1234/v1' },
      { ...HEALTHY_BASE, backendName: 'pi-2', endpoint: 'http://192.168.1.50:1234/v1' },
    ];
    render(
      <MemoryRouter>
        <Orchestrator />
      </MemoryRouter>
    );
    const banners = screen.getAllByRole('alert');
    expect(banners).toHaveLength(1);
    expect(banners[0]?.textContent).toContain('local-a');
    expect(banners[0]?.textContent).not.toContain('pi-2');
  });
});
