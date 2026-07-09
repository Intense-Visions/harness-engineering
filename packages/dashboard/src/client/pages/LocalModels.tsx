import { useLocalModelsPanel } from '../hooks/useLocalModelsPanel';
import { HardwareCard } from '../components/local-models/HardwareCard';
import { PoolCard } from '../components/local-models/PoolCard';
import { RecommendationsCard } from '../components/local-models/RecommendationsCard';

/**
 * LMLM Phase 8 — `/s/local-models` operator panel.
 *
 * Composes the Hardware, Pool (read-only, D-P8-2), and Recommendations (+
 * pending model proposals) cards over the single `useLocalModelsPanel` data
 * hook. Each card degrades independently (D-P8-4); when ALL four read routes
 * return 503 the page collapses to a single "LMLM disabled" banner (Truth 8)
 * instead of four separate error cards.
 *
 * The page never throws in any empty/degraded permutation (O3) — the cards own
 * their own empty/disabled copy, and `refetchAll` is threaded to the
 * Recommendations card so an approve/reject refreshes pool + recommendations.
 *
 * Owns exactly one WebSocket via the hook — do not mount another socket hook in
 * this tree (bundle/WS-double-connection note in the plan).
 */
export function LocalModels(): JSX.Element {
  const {
    hardware,
    pool,
    recommendations,
    proposals,
    allDisabled,
    refetchAll,
    installProgress,
    dismissInstall,
  } = useLocalModelsPanel();

  if (allDisabled) {
    return (
      <div data-testid="local-models-page" className="space-y-4">
        <header>
          <h1 className="text-xl font-bold">Local Models</h1>
        </header>
        <div data-testid="lmlm-disabled" className="rounded-lg border border-white/10 p-4">
          <p className="text-sm text-neutral-muted">
            LMLM disabled — enable the Local Model Lifecycle Manager via{' '}
            <span className="font-mono">harness.config.json</span> to manage local models here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="local-models-page" className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Local Models</h1>
        <p className="mt-0.5 text-xs text-neutral-muted">
          Hardware, managed model pool, and ranked recommendations for local inference.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HardwareCard hardware={hardware.data} error={hardware.error} loading={hardware.loading} />
        <PoolCard
          pool={pool.data}
          error={pool.error}
          loading={pool.loading}
          onMutated={refetchAll}
        />
      </div>

      <RecommendationsCard
        recommendations={recommendations.data}
        recommendationsError={recommendations.error}
        proposals={proposals.data}
        pool={pool.data}
        onDecided={refetchAll}
        loading={recommendations.loading}
        installProgress={installProgress}
        onDismissInstall={dismissInstall}
      />
    </div>
  );
}
