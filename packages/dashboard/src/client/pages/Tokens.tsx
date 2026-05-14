import { useEffect, useState, useCallback } from 'react';
import type { AuthTokenPublic } from '@harness-engineering/types';

interface CreatedToken {
  id: string;
  token: string;
}

export function Tokens() {
  const [tokens, setTokens] = useState<AuthTokenPublic[]>([]);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState('read-status');
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/tokens');
    if (res.ok) setTokens(((await res.json()) as AuthTokenPublic[]) ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createToken(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, scopes: scopes.split(',').map((s) => s.trim()) }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      setError(err.error ?? 'Failed');
      return;
    }
    const body = (await res.json()) as CreatedToken;
    setCreated(body);
    setName('');
    await refresh();
  }

  async function revoke(id: string) {
    if (!window.confirm(`Revoke ${id}?`)) return;
    await fetch(`/api/tokens/${id}`, { method: 'DELETE' });
    await refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Gateway API Tokens</h1>

      <form
        onSubmit={(e) => void createToken(e)}
        className="space-y-2 rounded-lg border border-white/10 p-4"
      >
        <h2 className="text-sm font-semibold">Create token</h2>
        <input
          className="block w-full rounded bg-white/5 px-3 py-2 text-sm"
          placeholder="Name (e.g. slack-bot)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="block w-full rounded bg-white/5 px-3 py-2 text-sm"
          placeholder="Scopes (comma-separated)"
          value={scopes}
          onChange={(e) => setScopes(e.target.value)}
          required
        />
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-sm">
          Create
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>

      {created && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider">
            Save this token — shown once.
          </p>
          <code className="mt-2 block break-all text-xs">{created.token}</code>
          <button onClick={() => setCreated(null)} className="mt-2 text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-neutral-muted">
            <th className="py-2">Name</th>
            <th>Scopes</th>
            <th>Created</th>
            <th>Last used</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.id} className="border-t border-white/5">
              <td className="py-2">{t.name}</td>
              <td>{t.scopes.join(', ')}</td>
              <td>{new Date(t.createdAt).toLocaleString()}</td>
              <td>{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : '—'}</td>
              <td>
                <button
                  onClick={() => void revoke(t.id)}
                  className="text-xs text-red-400 underline"
                >
                  Revoke
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
