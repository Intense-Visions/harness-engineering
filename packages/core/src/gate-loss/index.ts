/**
 * Taguchi continuous quality loss (issue #1673) — emit a continuous
 * distance-to-threshold ("loss") alongside binary gate verdicts so "passed
 * barely" and "passed comfortably" are distinguishable, and a codebase drifting
 * toward its limits shows rising loss while every gate still passes green.
 *
 * Measurement/emission only: nothing here changes any gate's pass/fail decision.
 */
export type {
  GateBound,
  GateMeasurement,
  GateLoss,
  AccumulatedLoss,
  LossAlarmInput,
  LossAlarm,
} from './types';
export { computeGateLoss, computeGateLosses, MAX_PROXIMITY } from './compute';
export { accumulateLoss, detectLossAlarm } from './accumulate';
