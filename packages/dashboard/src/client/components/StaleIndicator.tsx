interface Props {
  lastUpdated: string | null;
  stale: boolean;
  error: string | null;
}

export function StaleIndicator({ lastUpdated, stale, error }: Props) {
  const formatted = lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : null;

  if (stale || error) {
    return (
      <div className="flex items-center gap-2 text-xs text-yellow-400">
        <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
        <span>{error ?? 'Stale data'}</span>
        {formatted && <span className="text-gray-500">· last updated {formatted}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
      <span>Live{formatted ? ` · updated ${formatted}` : ''}</span>
    </div>
  );
}
