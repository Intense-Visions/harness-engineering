import type { SignalPoint } from '@harness-engineering/signals';
import type { RollbackDecision } from '@harness-engineering/core';

/** Reads stored daily points for a signal name (empty for unknown/absent). */
export type TimelineReader = (signalName: string) => SignalPoint[];

/** Resolves PR numbers merged within [startIso, nowIso] (inclusive). */
export type PrResolver = (startIso: string, nowIso: string) => Promise<number[]>;

/** Injected clock for deterministic window math. */
export type Clock = () => Date;

/** Config rule shape the sweep consumes (mirrors RollbackSignalRuleSchema). */
export interface SweepSignalRule {
  threshold: number;
  direction: 'above' | 'below';
  window: string;
}

export interface RollbackSweepDeps {
  readTimeline: TimelineReader;
  resolveMergedPrs: PrResolver;
  evaluate: (pr: number) => Promise<RollbackDecision>;
  now?: Clock;
}
