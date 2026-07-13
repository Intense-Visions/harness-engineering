import type { WebhookSubscriptionPublic } from '@harness-engineering/types';

export function SubscriptionList({
  subs,
  onRemove,
}: {
  subs: WebhookSubscriptionPublic[];
  onRemove: (id: string) => void;
}) {
  return (
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
                onClick={() => onRemove(s.id)}
                className="rounded bg-red-600/40 px-3 py-1 text-xs"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
