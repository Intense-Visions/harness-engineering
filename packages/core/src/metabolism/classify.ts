/**
 * Basal token metabolism — spend classifier (#1628).
 *
 * Bioenergetics separates an organism's *basal* metabolic rate — the energy it
 * burns just existing — from the energy it spends building something new. Token
 * accounting has no such split: re-verification of unchanged state, CI re-runs,
 * context re-serialization, graph refresh, idle-loop polling, and re-derivation
 * of already-known facts are booked identically to productive work.
 *
 * This module classifies a single {@link SpendEvent} — one telemetry-attributed
 * token burst — as {@link SpendClass}:
 *
 *  - `anabolic` — spend that produced a new artifact, decision, or verified fact.
 *  - `basal` — spend that produced no new artifact/decision/fact (pure
 *    maintenance burn).
 *  - `unattributable` — spend that cannot be linked to an outcome either way.
 *
 * The classification is derived from **outcome linkage** already carried by the
 * existing telemetry ({@link import('@harness-engineering/types').SkillInvocationRecord}
 * outcome / failureCategory, and the `producedArtifact` linkage when known). It
 * is a pure function of its inputs — no I/O, no clock.
 *
 * Scope note: this slice classifies and reports only. Wiring the resulting
 * basal-share into a budget/governor gate is deliberately deferred (#1628).
 */

/** The three-way spend classification taxonomy. */
export type SpendClass = 'basal' | 'anabolic' | 'unattributable';

/** All spend classes, in report order. */
export const SPEND_CLASSES: readonly SpendClass[] = ['basal', 'anabolic', 'unattributable'];

/**
 * Outcome of the workflow the burst belongs to, mirroring
 * `SkillInvocationRecord.outcome`. A `completed` run produced its output
 * (anabolic); a `failed` / `abandoned` run produced nothing new (basal).
 */
export type SpendOutcome = 'completed' | 'failed' | 'abandoned';

/**
 * One telemetry-attributed token burst, normalized from an existing telemetry
 * surface (adoption invocation, usage record, outcome node). The classifier
 * reads only outcome-linkage signals — it never inspects raw prompts.
 */
export interface SpendEvent {
  /**
   * Workflow class the burst belongs to (e.g. the skill name, or a maintenance
   * loop identifier). Drives the ranked-waste decomposition and the
   * per-workflow-class breakdown.
   */
  workflowClass: string;
  /** Tokens burned in this event. Non-negative. */
  tokens: number;
  /**
   * Explicit outcome linkage when known: did this burst produce a new
   * artifact/decision/verified fact? `true` → anabolic, `false` → basal. When
   * absent, classification falls back to {@link outcome} / maintenance-class.
   */
  producedArtifact?: boolean;
  /** Workflow outcome, when derivable from the source telemetry. */
  outcome?: SpendOutcome;
  /**
   * Optional maintenance-loop label used to group basal spend in the
   * ranked-waste decomposition (e.g. `ci-rerun`, `graph-refresh`,
   * `context-reserialization`, `idle-poll`, `reverification`). Falls back to
   * {@link workflowClass} when absent.
   */
  maintenanceLoop?: string;
  /** ISO 8601 timestamp of the burst, when known (carried through for windowing). */
  timestamp?: string;
}

/**
 * Configuration for the classifier. `maintenanceClasses` names workflow classes
 * that are basal *by nature* — loops whose entire purpose is upkeep and which
 * therefore produce no new artifact regardless of whether they "completed"
 * (e.g. a graph refresh that finds nothing changed still "completes").
 */
export interface MetabolismConfig {
  /**
   * Workflow classes that are inherently basal. Matched case-insensitively
   * against {@link SpendEvent.workflowClass}. An event in one of these classes
   * is basal even when its outcome is `completed`, unless `producedArtifact`
   * explicitly says otherwise.
   */
  maintenanceClasses: readonly string[];
}

/**
 * The default set of inherently-basal maintenance workflow classes, seeded from
 * the maintenance loops named in #1628. Adopter-portable: a project can pass its
 * own set; this default degrades gracefully (an unknown class is classified by
 * outcome instead).
 */
export const DEFAULT_MAINTENANCE_CLASSES: readonly string[] = [
  'reverification',
  're-verification',
  'ci-rerun',
  'ci-re-run',
  'context-reserialization',
  'context-re-serialization',
  'graph-refresh',
  'idle-poll',
  'idle-loop-polling',
  'fact-rederivation',
  'baseline-refresh',
];

/** The default classifier configuration. */
export const DEFAULT_METABOLISM_CONFIG: MetabolismConfig = {
  maintenanceClasses: DEFAULT_MAINTENANCE_CLASSES,
};

function isMaintenanceClass(workflowClass: string, config: MetabolismConfig): boolean {
  const lowered = workflowClass.toLowerCase();
  return config.maintenanceClasses.some((c) => c.toLowerCase() === lowered);
}

/**
 * Classify a single spend event by outcome linkage.
 *
 * Precedence (most authoritative first):
 *  1. Explicit `producedArtifact` linkage wins outright.
 *  2. A workflow class that is basal by nature ({@link MetabolismConfig.maintenanceClasses})
 *     is basal.
 *  3. Otherwise derive from `outcome`: `completed` → anabolic (it produced its
 *     output), `failed` / `abandoned` → basal (re-verification / gate-rejected /
 *     re-run that produced nothing new).
 *  4. No usable signal → `unattributable`.
 */
export function classifySpend(
  event: SpendEvent,
  config: MetabolismConfig = DEFAULT_METABOLISM_CONFIG
): SpendClass {
  if (event.producedArtifact === true) return 'anabolic';
  if (event.producedArtifact === false) return 'basal';

  if (isMaintenanceClass(event.workflowClass, config)) return 'basal';

  switch (event.outcome) {
    case 'completed':
      return 'anabolic';
    case 'failed':
    case 'abandoned':
      return 'basal';
    default:
      return 'unattributable';
  }
}
