/**
 * Ablation driver — apply an ablation to a run's context and drive an injected
 * {@link ReplayRunner} over the full ablation suite.
 *
 * Pure with respect to context transformation; the only effectful part is the
 * injected runner, which is awaited so a real replay driver can pace itself.
 */

import {
  BASELINE,
  INFORMATION_CLASSES,
  type Ablation,
  type InformationClass,
  type ReplayObservation,
  type ReplayRun,
  type ReplayRunner,
} from './types';

/**
 * Apply an ablation to a run's context: return a copy of the context map with
 * the ablated information class removed. `baseline` returns the context
 * unchanged (a shallow copy). Pure — never mutates {@link ReplayRun.context}.
 */
export function applyAblation(
  run: ReplayRun,
  ablation: Ablation
): Partial<Record<InformationClass, string>> {
  const next: Partial<Record<InformationClass, string>> = { ...run.context };
  if (ablation.kind === 'ablated') {
    delete next[ablation.informationClass];
  }
  return next;
}

/**
 * The full ablation suite: the baseline plus one ablation per information class,
 * in canonical order. Every run is replayed under each of these.
 */
export function ablationSuite(): Ablation[] {
  return [
    BASELINE,
    ...INFORMATION_CLASSES.map(
      (informationClass): Ablation => ({ kind: 'ablated', informationClass })
    ),
  ];
}

/**
 * Replay every run under the full ablation suite, producing one
 * {@link ReplayObservation} per (run × ablation).
 *
 * The runner is awaited sequentially. Failures are **not** swallowed — a
 * distortion report built on silently-missing replays would be a lie, so a
 * runner rejection propagates and aborts the suite.
 */
export async function runAblationSuite(
  runs: readonly ReplayRun[],
  runner: ReplayRunner
): Promise<ReplayObservation[]> {
  const observations: ReplayObservation[] = [];
  for (const run of runs) {
    for (const ablation of ablationSuite()) {
      const outcome = await runner(run, ablation);
      observations.push({
        runId: run.runId,
        taskClass: run.taskClass,
        ablation,
        outcome,
      });
    }
  }
  return observations;
}
