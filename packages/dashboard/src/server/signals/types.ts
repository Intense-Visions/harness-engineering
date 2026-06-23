import type { GraphStore } from '@harness-engineering/graph';
import type { CommandRunner } from './command-runner';

export type SignalId =
  | 'pr-merged-without-multi-persona-review'
  | 'coverage-trend-down-30d'
  | 'complexity-trend-up-30d'
  | 'baseline-auto-update-count'
  | 'eval-fail-rate';

export type SignalStatus = 'ok' | 'warn' | 'alert' | 'pending' | 'error';

/** A single daily data point. `date` is `YYYY-MM-DD`. */
export interface SignalPoint {
  date: string;
  value: number;
}

export interface SignalResult {
  id: SignalId;
  label: string;
  /** Current value; `null` when pending/error. */
  value: number | null;
  /** Unit suffix, e.g. '%', 'count'. */
  unit: string;
  trend: 'up' | 'down' | 'flat';
  /** Which direction is healthy; drives status color. */
  betterDirection: 'up' | 'down';
  status: SignalStatus;
  threshold: { warn: number; alert: number };
  /** Up to 30 daily points. */
  history: SignalPoint[];
  /** Human-readable one-liner. */
  detail: string;
  /** Provenance, e.g. 'arch/timeline.json'. */
  source: string;
}

export interface SignalContext {
  projectPath: string;
  now: Date;
  timeline: import('./timeline-store').SignalTimelineStore;
  graphStore?: GraphStore;
  /** Injectable git/gh runner. Defaults to `defaultCommandRunner` per-provider when absent. */
  runCommand?: CommandRunner;
}

export type { CommandRunner } from './command-runner';

export interface SignalProvider {
  id: SignalId;
  label: string;
  compute(ctx: SignalContext): Promise<SignalResult>;
}
