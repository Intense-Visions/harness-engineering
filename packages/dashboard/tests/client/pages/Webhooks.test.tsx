import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { WebhookSubscriptionPublic } from '@harness-engineering/types';
import type { QueueStats } from '../../../src/client/components/webhooks/QueueStatsPanel';
import { Webhooks } from '../../../src/client/pages/Webhooks';

// Wire-shape fixtures matching the public (secret-redacted) list response
// and the queue/stats poll payload the component consumes.
const SUB_A: WebhookSubscriptionPublic = {
  id: 'whk_00000000000000aa',
  tokenId: 'tok_a',
  url: 'https://a.example.com/hook',
  events: ['maintenance.completed', 'interaction.*'],
  createdAt: '2026-05-05T09:00:00.000Z',
};
const SUB_B: WebhookSubscriptionPublic = {
  id: 'whk_00000000000000bb',
  tokenId: 'tok_b',
  url: 'https://b.example.com/hook',
  events: ['deploy.*'],
  createdAt: '2026-05-06T09:00:00.000Z',
};

const QUEUE_STATS: QueueStats = {
  pending: 3,
  inFlight: 1,
  failed: 2,
  dead: 0,
  delivered: 42,
};

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockConfirm = vi.fn();
vi.stubGlobal('confirm', mockConfirm);

/**
 * Route fetch by (url, method). The list endpoint reads from a mutable
 * `subsRef` so a refresh after create/delete observes updated state, which
 * is what the component actually does (it re-GETs after every mutation).
 */
function installFetchRouter(opts: {
  subsRef: { current: WebhookSubscriptionPublic[] };
  createResult?: { ok: boolean; body: unknown };
}) {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';

    if (url === '/api/v1/webhooks/queue/stats') {
      return Promise.resolve({ ok: true, json: async () => QUEUE_STATS });
    }
    if (url === '/api/v1/webhooks' && method === 'GET') {
      return Promise.resolve({ ok: true, json: async () => opts.subsRef.current });
    }
    if (url === '/api/v1/webhooks' && method === 'POST') {
      const r = opts.createResult ?? { ok: true, body: { id: SUB_A.id, secret: 's'.repeat(44) } };
      return Promise.resolve({ ok: r.ok, json: async () => r.body });
    }
    if (method === 'DELETE') {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  mockConfirm.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Webhooks page — subscription list', () => {
  it('renders subscriptions returned by GET /api/v1/webhooks', async () => {
    installFetchRouter({ subsRef: { current: [SUB_A, SUB_B] } });

    render(<Webhooks />);

    await waitFor(() => {
      expect(screen.getByText(SUB_A.url)).toBeDefined();
    });
    expect(screen.getByText(SUB_B.url)).toBeDefined();
    expect(screen.getByText(SUB_A.id)).toBeDefined();
  });

  it('shows the empty state when there are no subscriptions', async () => {
    installFetchRouter({ subsRef: { current: [] } });

    render(<Webhooks />);

    await waitFor(() => {
      expect(screen.getByText(/no subscriptions yet/i)).toBeDefined();
    });
  });
});

describe('Webhooks page — queue stats polling', () => {
  it('renders the delivery-queue panel from the initial /queue/stats poll', async () => {
    installFetchRouter({ subsRef: { current: [] } });

    render(<Webhooks />);

    // The panel only mounts once queueStats !== null, i.e. after a successful poll.
    await waitFor(() => {
      expect(screen.getByText(/delivery queue/i)).toBeDefined();
    });
    expect(screen.getByText(String(QUEUE_STATS.delivered))).toBeDefined();
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/webhooks/queue/stats');
  });
});

describe('Webhooks page — create subscription', () => {
  it('POSTs trimmed comma-split events and reveals the one-time secret banner', async () => {
    const subsRef = { current: [] as WebhookSubscriptionPublic[] };
    const secret = 'x'.repeat(44);
    installFetchRouter({
      subsRef,
      createResult: { ok: true, body: { id: SUB_A.id, secret } },
    });

    render(<Webhooks />);

    // Fill the URL (events default is prefilled by the component).
    const urlInput = await screen.findByPlaceholderText(/url/i);
    fireEvent.change(urlInput, { target: { value: SUB_A.url } });

    // After creation the list refresh should surface the new sub.
    subsRef.current = [SUB_A];
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }));

    // Secret banner appears with the one-time secret.
    await waitFor(() => {
      expect(screen.getByText(secret)).toBeDefined();
    });
    expect(screen.getByText(/never shown again/i)).toBeDefined();

    // Verify the POST payload: default events string split + trimmed.
    const postCall = mockFetch.mock.calls.find(
      ([u, init]) => u === '/api/v1/webhooks' && init?.method === 'POST'
    );
    expect(postCall).toBeDefined();
    const sentBody = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(sentBody).toEqual({
      url: SUB_A.url,
      events: ['maintenance.completed', 'interaction.*'],
    });
  });

  it('surfaces the server error message and does not show a secret on a failed create', async () => {
    installFetchRouter({
      subsRef: { current: [] },
      createResult: { ok: false, body: { error: 'url must be https' } },
    });

    render(<Webhooks />);

    const urlInput = await screen.findByPlaceholderText(/url/i);
    fireEvent.change(urlInput, { target: { value: 'https://bad.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }));

    await waitFor(() => {
      expect(screen.getByText('url must be https')).toBeDefined();
    });
    expect(screen.queryByText(/never shown again/i)).toBeNull();
  });
});

describe('Webhooks page — delete subscription', () => {
  it('DELETEs the encoded id after the user confirms', async () => {
    const subsRef = { current: [SUB_A] as WebhookSubscriptionPublic[] };
    installFetchRouter({ subsRef });
    mockConfirm.mockReturnValue(true);

    render(<Webhooks />);

    await waitFor(() => expect(screen.getByText(SUB_A.url)).toBeDefined());

    // On confirm, the list refresh returns an empty set.
    subsRef.current = [];
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/v1/webhooks/${encodeURIComponent(SUB_A.id)}`,
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  it('does not issue a DELETE when the user cancels the confirm', async () => {
    installFetchRouter({ subsRef: { current: [SUB_A] } });
    mockConfirm.mockReturnValue(false);

    render(<Webhooks />);

    await waitFor(() => expect(screen.getByText(SUB_A.url)).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(mockConfirm).toHaveBeenCalledOnce();
    const deleteCalls = mockFetch.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE'
    );
    expect(deleteCalls).toHaveLength(0);
  });
});
