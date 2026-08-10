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
  session: SessionBlock;
  status: BurnStatus;
}
