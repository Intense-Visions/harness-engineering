import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { AuthTokenPublic } from '@harness-engineering/types';
import { Tokens } from '../../../src/client/pages/Tokens';

// Wire-shape fixtures matching the public (secret-redacted) list response the
// page consumes from GET /api/v1/auth/tokens.
const TOKEN_A: AuthTokenPublic = {
  id: 'tok_00000000000000aa',
  name: 'slack-bot',
  scopes: ['read-status', 'trigger-job'],
  createdAt: '2026-05-05T09:00:00.000Z',
  lastUsedAt: '2026-05-06T10:00:00.000Z',
};
// TOKEN_B intentionally omits lastUsedAt so we can assert the em-dash fallback.
const TOKEN_B: AuthTokenPublic = {
  id: 'tok_00000000000000bb',
  name: 'ci-runner',
  scopes: ['admin'],
  createdAt: '2026-05-06T09:00:00.000Z',
};

const LIST_URL = '/api/v1/auth/tokens';
const CREATE_URL = '/api/v1/auth/token';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockConfirm = vi.fn();
vi.stubGlobal('confirm', mockConfirm);

/**
 * Route fetch by (url, method). The list endpoint reads from a mutable
 * `tokensRef` so a refresh after create/revoke observes updated state — which
 * is what the component actually does (it re-GETs after every mutation).
 */
function installFetchRouter(opts: {
  tokensRef: { current: AuthTokenPublic[] };
  createResult?: { ok: boolean; body: unknown };
}) {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';

    if (url === LIST_URL && method === 'GET') {
      return Promise.resolve({ ok: true, json: async () => opts.tokensRef.current });
    }
    if (url === CREATE_URL && method === 'POST') {
      const r = opts.createResult ?? {
        ok: true,
        body: { id: TOKEN_A.id, token: 'sk_live_secret' },
      };
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

describe('Tokens page — token list', () => {
  it('renders one row per token returned by GET /api/v1/auth/tokens', async () => {
    installFetchRouter({ tokensRef: { current: [TOKEN_A, TOKEN_B] } });

    render(<Tokens />);

    await waitFor(() => {
      expect(screen.getByText(TOKEN_A.name)).toBeDefined();
    });
    expect(screen.getByText(TOKEN_B.name)).toBeDefined();
    // Scopes are joined with ', ' for display.
    expect(screen.getByText(TOKEN_A.scopes.join(', '))).toBeDefined();
    expect(screen.getByText(TOKEN_B.scopes.join(', '))).toBeDefined();
    expect(mockFetch).toHaveBeenCalledWith(LIST_URL);
  });

  it('renders an em-dash for a token that has never been used', async () => {
    // Only TOKEN_B lacks lastUsedAt, so exactly one em-dash should appear.
    installFetchRouter({ tokensRef: { current: [TOKEN_A, TOKEN_B] } });

    render(<Tokens />);

    await waitFor(() => expect(screen.getByText(TOKEN_B.name)).toBeDefined());
    expect(screen.getAllByText('—')).toHaveLength(1);
  });
});

describe('Tokens page — create token', () => {
  it('POSTs the name and comma-split, trimmed scopes and reveals the one-time token', async () => {
    const tokensRef = { current: [] as AuthTokenPublic[] };
    const oneTimeToken = 'sk_live_shown_once';
    installFetchRouter({
      tokensRef,
      createResult: { ok: true, body: { id: TOKEN_A.id, token: oneTimeToken } },
    });

    render(<Tokens />);

    const nameInput = await screen.findByPlaceholderText(/name/i);
    fireEvent.change(nameInput, { target: { value: 'slack-bot' } });

    const scopesInput = screen.getByPlaceholderText(/scopes/i);
    // Whitespace around commas exercises the .split(',').map(trim) parsing.
    fireEvent.change(scopesInput, { target: { value: 'read-status, trigger-job , admin' } });

    // After creation the list refresh should surface the new token.
    tokensRef.current = [TOKEN_A];
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    // One-time token banner appears with the raw secret.
    await waitFor(() => {
      expect(screen.getByText(oneTimeToken)).toBeDefined();
    });
    expect(screen.getByText(/shown once/i)).toBeDefined();

    // Verify the POST payload: name + parsed scope array.
    const postCall = mockFetch.mock.calls.find(
      ([u, init]) => u === CREATE_URL && (init as RequestInit | undefined)?.method === 'POST'
    );
    expect(postCall).toBeDefined();
    const sentBody = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(sentBody).toEqual({
      name: 'slack-bot',
      scopes: ['read-status', 'trigger-job', 'admin'],
    });

    // Name input is cleared after a successful create.
    expect((nameInput as HTMLInputElement).value).toBe('');
  });

  it('surfaces the server error message and does not reveal a token on a failed create', async () => {
    installFetchRouter({
      tokensRef: { current: [] },
      createResult: { ok: false, body: { error: 'name already exists' } },
    });

    render(<Tokens />);

    const nameInput = await screen.findByPlaceholderText(/name/i);
    fireEvent.change(nameInput, { target: { value: 'dup' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText('name already exists')).toBeDefined();
    });
    expect(screen.queryByText(/shown once/i)).toBeNull();
  });

  it('falls back to a generic error when the server omits an error message', async () => {
    installFetchRouter({
      tokensRef: { current: [] },
      createResult: { ok: false, body: {} },
    });

    render(<Tokens />);

    const nameInput = await screen.findByPlaceholderText(/name/i);
    fireEvent.change(nameInput, { target: { value: 'oops' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeDefined();
    });
  });
});

describe('Tokens page — revoke token', () => {
  it('DELETEs the encoded id after the user confirms', async () => {
    const tokensRef = { current: [TOKEN_A] as AuthTokenPublic[] };
    installFetchRouter({ tokensRef });
    mockConfirm.mockReturnValue(true);

    render(<Tokens />);

    await waitFor(() => expect(screen.getByText(TOKEN_A.name)).toBeDefined());

    // On confirm, the list refresh returns an empty set.
    tokensRef.current = [];
    fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `${LIST_URL}/${encodeURIComponent(TOKEN_A.id)}`,
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  it('does not issue a DELETE when the user cancels the confirm', async () => {
    installFetchRouter({ tokensRef: { current: [TOKEN_A] } });
    mockConfirm.mockReturnValue(false);

    render(<Tokens />);

    await waitFor(() => expect(screen.getByText(TOKEN_A.name)).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

    expect(mockConfirm).toHaveBeenCalledOnce();
    const deleteCalls = mockFetch.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE'
    );
    expect(deleteCalls).toHaveLength(0);
  });
});
