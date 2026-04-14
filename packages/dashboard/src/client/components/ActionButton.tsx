import { useEffect } from 'react';
import { useApi } from '../hooks/useApi';

interface Props {
  url: string;
  label: string;
  body?: unknown;
  /** Optional label shown while loading */
  loadingLabel?: string;
  onSuccess?: () => void;
}

/**
 * A button that triggers a POST action endpoint.
 * Shows loading spinner during request, success/error feedback after.
 */
export function ActionButton({ url, label, body, loadingLabel, onSuccess }: Props) {
  const { state, error, run } = useApi(url);

  useEffect(() => {
    if (state === 'success') {
      onSuccess?.();
    }
  }, [state, onSuccess]);

  const isLoading = state === 'loading';
  const isSuccess = state === 'success';
  const isError = state === 'error';

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={() => void run(body)}
        disabled={isLoading}
        className={[
          'inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors',
          isLoading ? 'cursor-not-allowed bg-neutral-surface text-neutral-muted' : '',
          isSuccess ? 'bg-emerald-800 text-emerald-200' : '',
          isError ? 'bg-red-900 text-red-200 hover:bg-red-800' : '',
          !isLoading && !isSuccess && !isError
            ? 'bg-primary-500 text-neutral-text hover:bg-primary-500/90'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {isLoading && (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-gray-500 border-t-transparent" />
        )}
        {isLoading ? (loadingLabel ?? label) : isSuccess ? '✓ Done' : label}
      </button>
      {isError && error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
