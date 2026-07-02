import type { SignalProvider } from './types';
import { prReviewProvider } from './providers/pr-review';
import { coverageTrendProvider } from './providers/coverage-trend';
import { complexityTrendProvider } from './providers/complexity-trend';
import { baselineUpdatesProvider } from './providers/baseline-updates';
import { evalFailRateProvider } from './providers/eval-fail-rate';

/**
 * The five curated signals in canonical display order (spec signal table:
 * pr-review, coverage, complexity, baseline, eval). The gatherer iterates this
 * array with `Promise.allSettled` so the panel renders them in this order.
 *
 * @internal Consumed by `gatherSignals`, not by HTTP input.
 */
export const signalRegistry: SignalProvider[] = [
  prReviewProvider,
  coverageTrendProvider,
  complexityTrendProvider,
  baselineUpdatesProvider,
  evalFailRateProvider,
];
