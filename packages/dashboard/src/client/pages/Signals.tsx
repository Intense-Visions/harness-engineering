import { useSignals } from '../hooks/useSignals';
import { SignalCard } from '../components/SignalCard';

export function Signals() {
  const { data, loading, error } = useSignals();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Signals</h1>
        {data?.generatedAt && (
          <span className="text-xs text-neutral-muted">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {loading && (
        <p data-testid="signals-loading" className="text-sm text-neutral-muted">
          Loading signals…
        </p>
      )}

      {error && (
        <p data-testid="signals-error" className="text-sm text-red-400">
          Failed to load signals: {error}
        </p>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </div>
  );
}
