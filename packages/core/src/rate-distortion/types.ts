/**
 * Rate-distortion context compaction — ablation harness types (issue #1633).
 *
 * Context compaction today is lossy compression with **no distortion metric**:
 * summarization drops information by vibes, and the loss surfaces downstream as
 * rework, wrong turns, and re-derivation. Rate-distortion theory says the problem
 * is only well-posed once distortion is *defined* — then there is a frontier, and
 * operating away from it is waste.
 *
 * This module defines distortion **empirically and task-conditioned**: ablate an
 * information class from a replayed run's context and measure the error/rework
 * delta it causes, per task class. The emitted distortion model (see
 * {@link ./distortion-model}) is a **report** — this slice deliberately does NOT
 * wire the model into the live compaction dial (deferred follow-up). It is the
 * reusable measurement substrate MDL pruning (#1630) later consumes.
 *
 * Seam: the actual replay *execution* (re-running an agent with ablated context)
 * is represented by the injected {@link ReplayRunner}. A real driver plugs in
 * there; fixtures seed ground truth for tests; the shipped CLI path consumes
 * pre-recorded {@link ReplayObservation}s, keeping this slice report-only.
 */

/**
 * The information classes that can be ablated from a replayed run's context.
 * Fixed taxonomy, straight from the issue — the five kinds of information a
 * long-running run accumulates and that compaction may drop.
 */
export type InformationClass =
  | 'prior-tool-results'
  | 'resolved-decisions'
  | 'code-excerpts'
  | 'conversational-history'
  | 'stated-constraints';

/** All information classes, in canonical (report) order. */
export const INFORMATION_CLASSES: readonly InformationClass[] = [
  'prior-tool-results',
  'resolved-decisions',
  'code-excerpts',
  'conversational-history',
  'stated-constraints',
];

/**
 * An ablation applied to a run before replay: the `baseline` (full context) or
 * the removal of exactly one {@link InformationClass}. The distortion of a class
 * is measured as the rework delta between its `ablated` replay and the run's
 * `baseline` replay.
 */
export type Ablation =
  | { readonly kind: 'baseline' }
  | { readonly kind: 'ablated'; readonly informationClass: InformationClass };

/** The baseline ablation (full, un-ablated context). */
export const BASELINE: Ablation = { kind: 'baseline' };

/**
 * The measured outcome of replaying a run under some ablation. `rework` is the
 * error/rework signal the run incurred downstream (retries, failed gates,
 * re-derivation) — higher is worse, and it must be ≥ 0.
 */
export interface ReplayOutcome {
  /** Downstream error/rework the run incurred. Higher = worse. Must be ≥ 0. */
  readonly rework: number;
  /**
   * Optional token cost of the (possibly ablated) context. Recorded for the
   * deferred frontier work (rate vs distortion); unused by the report-only fit.
   */
  readonly tokenCost?: number;
}

/**
 * One recorded run available for replay, with its context partitioned by
 * information class. A class absent from {@link ReplayRun.context} is treated as
 * empty (nothing to ablate).
 */
export interface ReplayRun {
  /** Stable run identifier (e.g. a black-box runId). */
  readonly runId: string;
  /**
   * The adopter-defined task class this run belongs to (e.g. `implementation`,
   * `debugging`, `planning`). Free-form — the model enumerates whatever task
   * classes appear, so it never hardcodes one repo's task taxonomy.
   */
  readonly taskClass: string;
  /** The run's context, partitioned by information class. */
  readonly context: Partial<Record<InformationClass, string>>;
}

/**
 * One measured datum: a run replayed under one ablation. Both the `baseline` and
 * each `ablated` replay of a run are observations; the fit pairs them by
 * {@link ReplayObservation.runId} to derive a delta.
 */
export interface ReplayObservation {
  readonly runId: string;
  readonly taskClass: string;
  readonly ablation: Ablation;
  readonly outcome: ReplayOutcome;
}

/**
 * Replays a run under an ablation and returns the measured outcome. This is the
 * injected execution seam: a real driver re-runs the agent with the ablated
 * context and scores its rework; fixtures return seeded outcomes. Kept out of the
 * pure fit so the report-only path never depends on a live execution engine.
 */
export type ReplayRunner = (
  run: ReplayRun,
  ablation: Ablation
) => ReplayOutcome | Promise<ReplayOutcome>;
