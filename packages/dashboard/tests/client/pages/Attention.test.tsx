import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Attention } from '../../../src/client/pages/Attention';
import type { PendingInteraction } from '../../../src/client/types/orchestrator';

// Mock hooks
const mockSocket = {
  snapshot: null,
  interactions: [] as PendingInteraction[],
  connected: true,
  removeInteraction: vi.fn(),
  setInteractions: vi.fn(),
};

vi.mock('../../../src/client/hooks/useOrchestratorSocket', () => ({
  useOrchestratorSocket: () => mockSocket,
}));

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

  it('has a Claim button that links to the chat page', async () => {
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
      const claimLink = screen.getByText('Claim');
      expect(claimLink.closest('a')?.getAttribute('href')).toBe(
        '/orchestrator/chat?interactionId=int-1'
      );
    });
  });
});
