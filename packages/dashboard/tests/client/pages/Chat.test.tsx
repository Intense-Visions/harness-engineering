import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Chat } from '../../../src/client/pages/Chat';
import type { PendingInteraction } from '../../../src/client/types/orchestrator';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeInteraction(): PendingInteraction {
  return {
    id: 'int-1',
    issueId: 'issue-1',
    type: 'needs-human',
    reasons: ['full-exploration scope'],
    context: {
      issueTitle: 'Design new feature',
      issueDescription: 'This needs careful planning.',
      specPath: 'docs/specs/feature.md',
      planPath: null,
      relatedFiles: ['src/core/engine.ts'],
    },
    createdAt: '2026-04-14T10:00:00Z',
    status: 'pending',
  };
}

function renderChat(search = '?interactionId=int-1') {
  return render(
    <MemoryRouter initialEntries={[`/orchestrator/chat${search}`]}>
      <Routes>
        <Route path="/orchestrator/chat" element={<Chat />} />
      </Routes>
    </MemoryRouter>
  );
}

// Helper to make a ReadableStream from SSE data
function makeSSEStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Chat (Claude Chat Pane) page', () => {
  it('shows loading while fetching interaction', () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [makeInteraction()],
    });
    renderChat();
    expect(screen.getByText(/Loading interaction context/i)).toBeDefined();
  });

  it('shows interaction title after loading', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [makeInteraction()],
    });
    renderChat();
    await waitFor(() => {
      expect(screen.getByText('Design new feature')).toBeDefined();
    });
  });

  it('has a message input and send button', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [makeInteraction()],
    });
    renderChat();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type your message/i)).toBeDefined();
      expect(screen.getByText('Send')).toBeDefined();
    });
  });

  it('sends message to /api/chat on submit', async () => {
    const interaction = makeInteraction();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [interaction] }) // GET /api/interactions
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }) // PATCH claim
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: makeSSEStream([
          'data: {"type":"text","text":"Hello"}\n\n',
          'data: {"type":"usage","inputTokens":10,"outputTokens":5}\n\n',
          'data: [DONE]\n\n',
        ]),
      }); // POST /api/chat

    renderChat();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type your message/i)).toBeDefined();
    });

    const input = screen.getByPlaceholderText(/Type your message/i);
    fireEvent.change(input, { target: { value: 'Help me plan this feature' } });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      // The chat endpoint was called
      const chatCall = mockFetch.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0] === '/api/chat'
      );
      expect(chatCall).toBeDefined();
    });
  });

  it('shows error state when no interactionId', () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    renderChat('');
    expect(screen.getByText(/No interaction selected/i)).toBeDefined();
  });

  it('shows Save Plan button', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [makeInteraction()],
    });
    renderChat();
    await waitFor(() => {
      expect(screen.getByText('Save Plan')).toBeDefined();
    });
  });
});
