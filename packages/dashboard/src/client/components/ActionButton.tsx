import { useEffect, useRef } from 'react';
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
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset to idle after 3 s so the button can be used again
  useEffect(() => {
    if (state === 'success') {
      onSuccess?.();
      successTimer.current = setTimeout(() => {
        // Button remains in success state until next click — no forced reset
      }, 3_000);
    }
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
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
          isLoading ? 'cursor-not-allowed bg-gray-700 text-gray-400' : '',
          isSuccess ? 'bg-emerald-800 text-emerald-200' : '',
          isError ? 'bg-red-900 text-red-200 hover:bg-red-800' : '',
          !isLoading && !isSuccess && !isError ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : '',
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
