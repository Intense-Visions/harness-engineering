import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Maintenance } from '../../../src/client/pages/Maintenance';

// Mock socket hook
const mockSocket = {
  snapshot: null,
  interactions: [],
  agentEvents: {},
  maintenanceEvent: null,
  connected: true,
  removeInteraction: vi.fn(),
  setInteractions: vi.fn(),
};

vi.mock('../../../src/client/hooks/useOrchestratorSocket', () => ({
  useOrchestratorSocket: () => mockSocket,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

interface HistoryEntry {
  task: string;
  status: 'success' | 'failed' | 'skipped';
  startedAt: string;
  durationMs: number;
  findings?: number;
}

function mockApi(history: HistoryEntry[]) {
  mockFetch.mockImplementation((url: string) => {
    if (url.endsWith('/api/maintenance/status')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          scheduledTasks: 20,
          lastRunAt: null,
          nextRunAt: null,
          running: false,
        }),
      });
    }
    if (url.endsWith('/api/maintenance/history')) {
      return Promise.resolve({
        ok: true,
        json: async () => history,
      });
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Maintenance page — candidate-count badge', () => {
  it('shows the badge for compound-candidates rows when findings > 0', async () => {
    mockApi([
      {
        task: 'compound-candidates',
        status: 'success',
        startedAt: '2026-05-05T09:00:00Z',
        durationMs: 1234,
        findings: 5,
      },
    ]);

    render(<Maintenance />);

    await waitFor(() => {
      expect(screen.getByText(/5 candidates/i)).toBeDefined();
    });
  });

  it('hides the badge for compound-candidates when findings is 0', async () => {
    mockApi([
      {
        task: 'compound-candidates',
        status: 'success',
        startedAt: '2026-05-05T09:00:00Z',
        durationMs: 1234,
        findings: 0,
      },
    ]);

    render(<Maintenance />);

    await waitFor(() => {
      expect(screen.getByText('compound-candidates')).toBeDefined();
    });
    expect(screen.queryByText(/^\d+ candidates$/)).toBeNull();
  });

  it('hides the badge for product-pulse rows even when findings > 0 (badge scoped to compound-candidates)', async () => {
    mockApi([
      {
        task: 'product-pulse',
        status: 'success',
        startedAt: '2026-05-05T08:00:00Z',
        durationMs: 1234,
        findings: 5,
      },
    ]);

    render(<Maintenance />);

    await waitFor(() => {
      expect(screen.getByText('product-pulse')).toBeDefined();
    });
    expect(screen.queryByText(/5 candidates/i)).toBeNull();
  });

  it('hides the badge when findings field is missing entirely', async () => {
    mockApi([
      {
        task: 'compound-candidates',
        status: 'success',
        startedAt: '2026-05-05T09:00:00Z',
        durationMs: 1234,
      },
    ]);

    render(<Maintenance />);

    await waitFor(() => {
      expect(screen.getByText('compound-candidates')).toBeDefined();
    });
    expect(screen.queryByText(/^\d+ candidates$/)).toBeNull();
  });
});
