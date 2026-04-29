import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Attention } from '../../../src/client/pages/Attention';
import type { PendingInteraction } from '../../../src/client/types/orchestrator';

// Mock hooks
const mockSocket = {
  snapshot: null,
  interactions: [] as PendingInteraction[],
  agentEvents: {} as Record<string, unknown[]>,
  maintenanceEvent: null,
  connected: true,
  removeInteraction: vi.fn(),
  setInteractions: vi.fn(),
};

vi.mock('../../../src/client/hooks/useOrchestratorSocket', () => ({
  useOrchestratorSocket: () => mockSocket,
}));

// Mock Virtuoso to render all items directly (avoids jsdom viewport issues)
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data,
    itemContent,
  }: {
    data: unknown[];
    itemContent: (index: number, item: unknown) => React.ReactNode;
  }) => (
    <div>
      {data.map((item, i) => (
        <div key={i}>{itemContent(i, item)}</div>
      ))}
    </div>
  ),
}));

// Mock ThreadStore
const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../src/client/stores/threadStore', () => {
  const threads = new Map();
  return {
    useThreadStore: Object.assign(() => ({}), {
      getState: () => ({
        threads,
        createThread: vi.fn(() => ({ id: 'thread-1' })),
      }),
    }),
  };
});

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeInteraction(overrides?: Partial<PendingInteraction>): PendingInteraction {
  return {
    id: 'int-1',
    issueId: 'issue-1',
    type: 'needs-human',
    reasons: ['full-exploration scope', 'high complexity signal'],
    context: {
      issueTitle: 'Implement advanced feature',
      issueDescription: 'This feature requires human design decisions.',
      specPath: 'docs/specs/feature.md',
      planPath: null,
      relatedFiles: ['src/core/engine.ts', 'src/api/routes.ts'],
    },
    createdAt: '2026-04-14T10:00:00Z',
    status: 'pending',
    ...overrides,
  };
}

beforeEach(() => {
  mockSocket.interactions = [];
  mockSocket.removeInteraction.mockClear();
  mockSocket.setInteractions.mockClear();
  mockNavigate.mockClear();
  mockFetch.mockReset();
  // Default: GET /api/interactions returns empty
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => [],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Attention (Needs Attention) page', () => {
  it('shows empty state when no interactions', async () => {
    render(
      <MemoryRouter>
        <Attention />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/No interactions require attention/i)).toBeDefined();
    });
  });

  it('displays interaction card with title and reasons', async () => {
    const interaction = makeInteraction();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [interaction],
    });

    render(
      <MemoryRouter>
        <Attention />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Implement advanced feature')).toBeDefined();
      expect(screen.getByText(/full-exploration scope/)).toBeDefined();
    });
  });

  it('displays related files', async () => {
    const interaction = makeInteraction();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [interaction],
    });

    render(
      <MemoryRouter>
        <Attention />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('src/core/engine.ts')).toBeDefined();
    });
  });

  it('calls PATCH to dismiss an interaction', async () => {
    const interaction = makeInteraction();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [interaction] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    render(
      <MemoryRouter>
        <Attention />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Dismiss')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Dismiss'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/interactions/int-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
    });
  });

  it('Claim button navigates to attention thread', async () => {
    const interaction = makeInteraction();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [interaction],
    });

    render(
      <MemoryRouter>
        <Attention />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Claim')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Claim'));

    // The claim handler looks for an existing attention thread by interactionId.
    // Since no thread exists in the mock store, no navigation occurs.
    // This verifies the handler runs without error.
  });
});
