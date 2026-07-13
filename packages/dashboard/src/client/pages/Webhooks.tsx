import { useEffect, useState, useCallback } from 'react';
import type { WebhookSubscriptionPublic } from '@harness-engineering/types';
import { QueueStatsPanel, type QueueStats } from '../components/webhooks/QueueStatsPanel';
import { SubscriptionList } from '../components/webhooks/SubscriptionList';
import {
  CreateSubscriptionForm,
  CreatedSecretBanner,
  type CreatedSubscription,
} from '../components/webhooks/CreateSubscriptionForm';

/**
 * Poll the queue stats endpoint every 1s. `mounted` guards against the
 * common React 18 race where a slow fetch resolves after the component
 * unmounts.
 */
function useQueueStats(): QueueStats | null {
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
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
  return queueStats;
}

export function Webhooks() {
  const [subs, setSubs] = useState<WebhookSubscriptionPublic[]>([]);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState('maintenance.completed,interaction.*');
  const [created, setCreated] = useState<CreatedSubscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queueStats = useQueueStats();

  const refresh = useCallback(async () => {
    const res = await fetch('/api/v1/webhooks');
    if (res.ok) setSubs(((await res.json()) as WebhookSubscriptionPublic[]) ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

      <CreateSubscriptionForm
        url={url}
        events={events}
        error={error}
        onUrlChange={setUrl}
        onEventsChange={setEvents}
        onSubmit={(e) => void createSub(e)}
      />

      {created && <CreatedSecretBanner created={created} />}

      <SubscriptionList subs={subs} onRemove={(id) => void remove(id)} />

      {queueStats !== null && <QueueStatsPanel stats={queueStats} />}
    </div>
  );
}
