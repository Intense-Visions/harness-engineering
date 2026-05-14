import { useEffect, useState, useCallback } from 'react';
import type { WebhookSubscriptionPublic } from '@harness-engineering/types';

interface CreatedSubscription {
  id: string;
  secret: string;
}

/**
 * Phase 4: live snapshot of the SQLite delivery queue. Source is
 * GET /api/v1/webhooks/queue/stats, polled at 1s. Spec D7 confirms
 * REST polling (not SSE) because the panel needs only a periodic
 * counter, not per-row events.
 */
interface QueueStats {
  pending: number;
  inFlight: number;
  failed: number;
  dead: number;
  delivered: number;
}

export function Webhooks() {
  const [subs, setSubs] = useState<WebhookSubscriptionPublic[]>([]);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState('maintenance.completed,interaction.*');
  const [created, setCreated] = useState<CreatedSubscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/v1/webhooks');
    if (res.ok) setSubs(((await res.json()) as WebhookSubscriptionPublic[]) ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll the queue stats endpoint every 1s. `mounted` guards against the
  // common React 18 race where a slow fetch resolves after the component
  // unmounts.
  useEffect(() => {
    let mounted = true;
    async function fetchStats(): Promise<void> {
      try {
        const res = await fetch('/api/v1/webhooks/queue/stats');
        if (res.ok && mounted) setQueueStats((await res.json()) as QueueStats);
      } catch {
        // Network blip — silently skip this tick; next poll will retry.
      }
    }
    void fetchStats();
    const id = setInterval(() => void fetchStats(), 1000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  async function createSub(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/v1/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, events: events.split(',').map((s) => s.trim()) }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      setError(err.error ?? 'Failed');
      return;
    }
    const body = (await res.json()) as { id: string; secret: string };
    setCreated({ id: body.id, secret: body.secret });
    setUrl('');
    await refresh();
  }

  async function remove(id: string) {
    if (!window.confirm(`Delete subscription ${id}?`)) return;
    await fetch(`/api/v1/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Webhook Subscriptions</h1>

      <form
        onSubmit={(e) => void createSub(e)}
        className="space-y-2 rounded-lg border border-white/10 p-4"
      >
        <h2 className="text-sm font-semibold">Create subscription</h2>
        <input
          className="block w-full rounded bg-white/5 px-3 py-2 text-sm"
          placeholder="URL (https://…)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <input
          className="block w-full rounded bg-white/5 px-3 py-2 text-sm"
          placeholder="Events (comma-separated globs)"
          value={events}
          onChange={(e) => setEvents(e.target.value)}
          required
        />
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-sm">
          Subscribe
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>

      {created && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-900/20 p-4">
          <p className="text-sm font-semibold text-yellow-200">
            Save this secret now — it is never shown again:
          </p>
          <pre className="mt-2 break-all rounded bg-black/40 p-2 text-xs">{created.secret}</pre>
          <p className="mt-2 text-xs text-yellow-200/70">Subscription ID: {created.id}</p>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Active subscriptions</h2>
        {subs.length === 0 ? (
          <p className="text-sm text-neutral-muted">No subscriptions yet.</p>
        ) : (
          <ul className="space-y-1">
            {subs.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded border border-white/10 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-mono text-xs text-neutral-muted">{s.id}</p>
                  <p>{s.url}</p>
                  <p className="text-xs text-neutral-muted">events: {s.events.join(', ')}</p>
                </div>
                <button
                  onClick={() => void remove(s.id)}
                  className="rounded bg-red-600/40 px-3 py-1 text-xs"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {queueStats !== null && (
        <div className="rounded-lg border border-white/10 p-4">
          <h2 className="mb-2 text-sm font-semibold">Delivery Queue</h2>
          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            <div className="rounded bg-white/5 p-2">
              <div className="text-lg font-bold">{queueStats.pending}</div>
              <div className="text-neutral-muted">Pending</div>
            </div>
            <div className="rounded bg-white/5 p-2">
              <div className="text-lg font-bold">{queueStats.failed}</div>
              <div className="text-neutral-muted">Retrying</div>
            </div>
            <div className="rounded bg-white/5 p-2">
              <div className="text-lg font-bold">{queueStats.inFlight}</div>
              <div className="text-neutral-muted">In flight</div>
            </div>
            <div className={`rounded p-2 ${queueStats.dead > 0 ? 'bg-red-900/30' : 'bg-white/5'}`}>
              <div className={`text-lg font-bold ${queueStats.dead > 0 ? 'text-red-400' : ''}`}>
                {queueStats.dead}
              </div>
              <div className="text-neutral-muted">Dead</div>
            </div>
            <div className="rounded bg-white/5 p-2">
              <div className="text-lg font-bold">{queueStats.delivered}</div>
              <div className="text-neutral-muted">Delivered</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
