interface Props {
  lastUpdated: string | null;
  stale: boolean;
  error: string | null;
}

export function StaleIndicator({ lastUpdated, stale, error }: Props) {
  const formatted = lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : null;

  if (stale || error) {
    return (
      <div className="flex items-center gap-2 text-xs text-secondary-400">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-secondary-400" />
        <span>{error ?? 'Stale data'}</span>
        {formatted && <span className="text-neutral-muted">· last updated {formatted}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-neutral-muted">
      <span className="inline-block h-2 w-2 rounded-full bg-secondary-400" />
      <span>Live{formatted ? ` · updated ${formatted}` : ''}</span>
    </div>
  );
}
