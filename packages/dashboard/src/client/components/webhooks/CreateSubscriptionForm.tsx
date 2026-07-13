export interface CreatedSubscription {
  id: string;
  secret: string;
}

export function CreateSubscriptionForm({
  url,
  events,
  error,
  onUrlChange,
  onEventsChange,
  onSubmit,
}: {
  url: string;
  events: string;
  error: string | null;
  onUrlChange: (value: string) => void;
  onEventsChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-lg border border-white/10 p-4">
      <h2 className="text-sm font-semibold">Create subscription</h2>
      <input
        className="block w-full rounded bg-white/5 px-3 py-2 text-sm"
        placeholder="URL (https://…)"
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        required
      />
      <input
        className="block w-full rounded bg-white/5 px-3 py-2 text-sm"
        placeholder="Events (comma-separated globs)"
        value={events}
        onChange={(e) => onEventsChange(e.target.value)}
        required
      />
      <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-sm">
        Subscribe
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}

export function CreatedSecretBanner({ created }: { created: CreatedSubscription }) {
  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-900/20 p-4">
      <p className="text-sm font-semibold text-yellow-200">
        Save this secret now — it is never shown again:
      </p>
      <pre className="mt-2 break-all rounded bg-black/40 p-2 text-xs">{created.secret}</pre>
      <p className="mt-2 text-xs text-yellow-200/70">Subscription ID: {created.id}</p>
    </div>
  );
}
