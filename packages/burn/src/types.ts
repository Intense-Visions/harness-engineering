/**
 * Wire shapes for the burn HUD.
 *
 * The snake_case keys are deliberate: `state/summary.json` is read by the
 * statusline binary, both hooks and the CLI report, and the Python HUD this
 * package replaces wrote exactly these keys. Keeping the shape identical is
 * what makes the cutover reversible — an older consumer can still read a
 * summary written by this code, and vice versa.
 */

/** Anchored weekly reset. `weekday` is 0=Mon..6=Sun, matching Python's `date.weekday()`. */
export interface WeekReset {
  weekday: number;
  time: string;
  tz: string;
}

export interface Calibration {
  /** ISO instant the calibration was taken. */
  at?: string;
  /** The whole percentage `/usage` reported at that instant. */
  reported_pct?: number;
  wtd_units_then?: number;
  implied_units_per_pct?: number;
  /** Date past which the calibration is no longer trusted (e.g. a promo end). */
  valid_until?: string;
  note?: string;
  /** Derived at summary time, never stored in config. */
  expired?: boolean;
  days_left?: number;
}

export interface BurnConfig {
  week_reset: WeekReset;
  weekly_budget_units: number | null;
  /** Per-family ceilings; a family can be spent while the pooled bar looks fine. */
  model_budgets: Record<string, number>;
  session_window_hours: number;
  session_budget_units: number | null;
  warm_ratio: number;
  hot_ratio: number;
  baseline_weeks: number;
  stale_after_minutes: number;
  calibration?: Calibration;
}

/** One deduped assistant turn, keyed by `requestId` in the store. */
export interface UsageRecord {
  ts: string;
  model: string;
  out: number;
  in: number;
  cacheWrite: number;
  cacheRead: number;
  /**
   * `main`, a subagent's `attributionAgent`, `unattributed`, or `pre-migration`.
   * Never empty. See the label vocabulary decision in the spec.
   */
  agent: string;
  /** The dispatch this turn belonged to — one fleet lane. Empty for the main thread. */
  agentId: string;
  /**
   * The invoking SKILL that spawned this turn, from `attributionSkill` (e.g.
   * `harness:autopilot`). This is the cut `/usage` groups by; the `agent`
   * column above is the orthogonal agent-TYPE cut. Never empty:
   * `unattributed-skill` when a turn carries no readable skill, `pre-migration`
   * for rows that predate skill tracking. See the reconciliation decision in
   * the README.
   */
  invokingSkill: string;
}

export interface ScanInfo {
  files_total: number;
  files_rescanned: number;
  records_added: number;
  records_total: number;
  /** Set when another scan held the lock; this one deferred rather than raced it. */
  skipped_locked?: boolean;
  data_loss_detected?: boolean;
  records_lost?: number;
  records_recovered?: number;
  /** Rows the rebuild could not recover — every figure is then a floor. */
  unrecovered?: number;
}

export type BurnStatus =
  | 'NO_DATA'
  | 'NO_BASELINE'
  | 'EARLY'
  | 'OK'
  | 'WARM'
  | 'HOT'
  | 'CRITICAL'
  | 'UNDERCOUNT';

export type Confidence = 'low' | 'medium' | 'high';

export interface BudgetBlock {
  set: boolean;
  units?: number;
  pct_used?: number;
  pct_projected?: number;
  remaining_units?: number;
  exhausts_at?: string;
  exhausts_before_reset?: boolean;
  exhaust_estimate_withheld?: string;
  runway_days?: number;
}

export interface ModelBlock {
  requests: number;
  units: number;
  pct_of_week: number;
  budget_units?: number;
  pct_of_budget?: number;
}

export interface AgentBlock {
  requests: number;
  units: number;
  pct_of_week: number;
  /**
   * Distinct non-empty `agentId`s seen this week under this label. `main`
   * records carry an empty `agentId`, so the empty id is excluded from the
   * count and `main` honestly reports 0.
   */
  lanes: number;
}

/**
 * Where the week's units went, by invoking SKILL — the cut `/usage` shows.
 *
 * Same shape as `AgentBlock` on purpose: the two are orthogonal cuts of the
 * same spend (skill vs agent type), so an existing consumer reads one without
 * learning a second idiom, and the two views reconcile against a shared total.
 */
export interface SkillBlock {
  requests: number;
  units: number;
  pct_of_week: number;
  /**
   * Distinct non-empty `agentId`s this skill dispatched this week. A turn that
   * carries no lane id (the main thread) contributes 0, so a skill made up
   * entirely of main-thread turns honestly reports 0 lanes.
   */
  lanes: number;
}

export interface AttributionBlock {
  attributed_units: number;
  main_units: number;
  unattributed_units: number;
  pre_migration_units: number;
  /**
   * Distinct non-empty `agentId`s seen in the current week across ALL labels.
   * A lane that appears under two labels (possible mid-migration, via the
   * upgrade rule) counts once, so this is not necessarily the sum of the
   * per-label `AgentBlock.lanes`.
   */
  lanes: number;
  /**
   * True when subagent spend was seen in the CURRENT WEEK and none of it
   * carried a readable agent label — the transcript shape changed and
   * attribution is no longer working. Degraded tooling is a headline, not a
   * footnote. `pre-migration` rows are excluded from the test: they are
   * legacy rows of unknown provenance, not evidence about the current
   * transcript shape, and letting them fire this flag would raise an alarm
   * about history on the very first upgraded scan.
   */
  degraded: boolean;
}

export interface SessionBlock {
  window_hours: number;
  requests: number;
  units: number;
  budget_units?: number;
  pct_used?: number;
}

export interface Summary {
  generated_at: string;
  scan: ScanInfo;
  week: {
    start: string;
    reset_at: string;
    reset_spec: string;
    tz: string;
    elapsed_frac: number;
    days_left: number;
    hours_left: number;
  };
  wtd: { requests: number; output_tokens: number; units: number };
  baseline: {
    complete_weeks_used: number;
    median_units: number | null;
    max_units: number | null;
    per_week_back: Record<string, number>;
  };
  projection: {
    units_at_reset: number;
    /** Kept visible so a shrunk forecast never silently replaces the raw one. */
    units_at_reset_linear: number;
    method: 'linear' | 'shrunk-to-baseline';
    ratio_vs_baseline: number | null;
    confidence: Confidence;
  };
  budget: BudgetBlock;
  calibration: Calibration;
  models: Record<string, ModelBlock>;
  models_exhausted: string[];
  agents: Record<string, AgentBlock>;
  /**
   * The same week's spend cut by invoking skill instead of agent type — the
   * grouping `/usage` uses. Partitions the week identically to `agents`; the
   * two are reconcilable views of one total, not a second number.
   */
  skills: Record<string, SkillBlock>;
  attribution: AttributionBlock;
  session: SessionBlock;
  status: BurnStatus;
}
