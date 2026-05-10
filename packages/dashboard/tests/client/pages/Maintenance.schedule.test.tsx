import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { MaintenanceEvent } from '../../../src/client/types/orchestrator';
import { Maintenance } from '../../../src/client/pages/Maintenance';

// Per-test settable mock for the socket hook.
let mockMaintenanceEvent: MaintenanceEvent | null = null;
const mockSocket = {
  snapshot: null,
  interactions: [],
  agentEvents: {},
  localModelStatuses: [],
  get maintenanceEvent() {
    return mockMaintenanceEvent;
  },
  connected: true,
  removeInteraction: vi.fn(),
  setInteractions: vi.fn(),
};
vi.mock('../../../src/client/hooks/useOrchestratorSocket', () => ({
  useOrchestratorSocket: () => mockSocket,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const FIXTURE_SCHEDULE = [
  {
    taskId: 'main-sync',
    type: 'housekeeping',
    nextRun: '2026-05-09T20:00:00Z',
    lastRun: null,
  },
  {
    taskId: 'session-cleanup',
    type: 'housekeeping',
    nextRun: '2026-05-09T20:30:00Z',
    lastRun: null,
  },
  {
    taskId: 'project-health',
    type: 'report-only',
    nextRun: '2026-05-09T21:00:00Z',
    lastRun: null,
  },
];

function mockApi() {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/api/maintenance/status')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          scheduledTasks: 3,
          lastRunAt: null,
          nextRunAt: null,
          running: false,
        }),
      });
    }
    if (url.endsWith('/api/maintenance/history')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (url.endsWith('/api/maintenance/schedule')) {
      return Promise.resolve({ ok: true, json: async () => FIXTURE_SCHEDULE });
    }
    if (url.endsWith('/api/maintenance/trigger') && init?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  mockMaintenanceEvent = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Maintenance page — schedule table & per-row Run Now', () => {
  it('renders one row per scheduled task with Task ID, Type, Next Run, Last Run, Action columns', async () => {
    mockApi();
    render(<Maintenance />);
    await waitFor(() => expect(screen.getByText('main-sync')).toBeDefined());
    expect(screen.getByText('session-cleanup')).toBeDefined();
    expect(screen.getByText('project-health')).toBeDefined();
    const buttons = screen.getAllByRole('button', { name: /run now/i });
    expect(buttons.length).toBe(3);
  });

  it('removes the legacy single "Trigger Run" button', async () => {
    mockApi();
    render(<Maintenance />);
    await waitFor(() => expect(screen.getByText('main-sync')).toBeDefined());
    expect(screen.queryByRole('button', { name: /trigger run/i })).toBeNull();
  });

  it("POSTs to /api/maintenance/trigger with the row's taskId when its Run Now is clicked", async () => {
    mockApi();
    render(<Maintenance />);
    await waitFor(() => expect(screen.getByText('main-sync')).toBeDefined());
    const mainSyncRow = screen.getByText('main-sync').closest('tr')!;
    const button = mainSyncRow.querySelector('button')!;
    fireEvent.click(button);
    await waitFor(() => {
      const triggerCall = mockFetch.mock.calls.find(
        ([url]) => typeof url === 'string' && url.endsWith('/api/maintenance/trigger')
      );
      expect(triggerCall).toBeDefined();
      expect(JSON.parse(triggerCall![1].body)).toEqual({ taskId: 'main-sync' });
    });
  });

  it("disables only the in-flight row's button while a task is running", async () => {
    mockApi();
    const { rerender } = render(<Maintenance />);
    await waitFor(() => expect(screen.getByText('main-sync')).toBeDefined());

    // Simulate a maintenance:started event for main-sync arriving via WebSocket.
    mockMaintenanceEvent = {
      type: 'maintenance:started',
      data: { taskId: 'main-sync', startedAt: '2026-05-09T20:00:01Z' },
    };
    rerender(<Maintenance />);

    await waitFor(() => {
      const mainSyncBtn = document.querySelector(
        'button[data-task-id="main-sync"]'
      ) as HTMLButtonElement | null;
      expect(mainSyncBtn).not.toBeNull();
      expect(mainSyncBtn!.disabled).toBe(true);
    });

    const sessionBtn = document.querySelector(
      'button[data-task-id="session-cleanup"]'
    ) as HTMLButtonElement | null;
    expect(sessionBtn).not.toBeNull();
    expect(sessionBtn!.disabled).toBe(false);
  });

  it('renders a baseref_fallback warning banner when the event is present', async () => {
    mockApi();
    mockMaintenanceEvent = {
      type: 'maintenance:baseref_fallback',
      data: { kind: 'baseref_fallback', ref: 'main', repoRoot: '/tmp/repo' },
    };
    render(<Maintenance />);
    const bannerLead = await waitFor(() => screen.getByText(/fell back/i));
    // Scope further assertions to the banner element so unrelated occurrences
    // of "main" (e.g. the main-sync row) do not match.
    const banner = bannerLead.closest('div')!;
    expect(banner).not.toBeNull();
    expect(banner.textContent).toMatch(/main/);
    expect(banner.textContent).toMatch(/\/tmp\/repo/);
  });
});

describe('Maintenance page — schedule fetch error handling (M-01)', () => {
  it('shows an inline error under the Schedule header when /schedule returns 500', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('/api/maintenance/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            scheduledTasks: 0,
            lastRunAt: null,
            nextRunAt: null,
            running: false,
          }),
        });
      }
      if (url.endsWith('/api/maintenance/history')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.endsWith('/api/maintenance/schedule')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: 'boom' }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    render(<Maintenance />);
    // The error message must appear under the Schedule heading, not as the
    // generic page-level error (which is reserved for status/history errors).
    const errorEl = await waitFor(() => screen.getByText(/failed to load schedule/i));
    expect(errorEl).toBeDefined();
    // The "Loading schedule..." placeholder must be gone once the error is set.
    expect(screen.queryByText(/loading schedule\.\.\./i)).toBeNull();
  });

  it('renders an empty schedule table without an error when /schedule returns 404 (older orchestrator)', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('/api/maintenance/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            scheduledTasks: 0,
            lastRunAt: null,
            nextRunAt: null,
            running: false,
          }),
        });
      }
      if (url.endsWith('/api/maintenance/history')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.endsWith('/api/maintenance/schedule')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ error: 'Not found' }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    render(<Maintenance />);
    // Wait for the load cycle to finish (status is rendered).
    await waitFor(() => expect(screen.getByText(/scheduler status/i)).toBeDefined());
    // The empty-schedule placeholder appears, NOT the error.
    await waitFor(() => expect(screen.getByText(/no scheduled tasks/i)).toBeDefined());
    expect(screen.queryByText(/failed to load schedule/i)).toBeNull();
  });
});
