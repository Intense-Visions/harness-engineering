import type { PulseWindow } from '@harness-engineering/types';

const LOOKBACK_RE = /^(\d+)(h|d)$/;

/**
 * Parse a lookback string into milliseconds.
 *
 * Accepts strings of the form `\d+h` (hours) or `\d+d` (days). Throws on any
 * other shape — minutes are not supported (the trailing buffer would dominate),
 * and undefined units are rejected to surface config bugs early.
 */
export function parseLookback(input: string): number {
  const match = LOOKBACK_RE.exec(input);
  if (!match) {
    throw new Error(`Invalid lookback "${input}": expected format like "24h" or "7d"`);
  }
  const n = Number(match[1]);
  const unit = match[2];
  return unit === 'h' ? n * 60 * 60 * 1000 : n * 24 * 60 * 60 * 1000;
}

/**
 * Compute the pulse query window with a trailing buffer.
 *
 * The buffer subtracts time from `now` to yield the window's upper bound,
 * giving downstream pipelines (PostHog late events, Sentry ingest, etc.) time
 * to settle before we read. The window's lower bound is then `lookback` before
 * the upper bound.
 *
 * Defaults: 15-minute buffer (Decision 11 in the proposal).
 */
export function computeWindow(now: Date, lookback: string, bufferMinutes = 15): PulseWindow {
  const lookbackMs = parseLookback(lookback);
  const bufferMs = bufferMinutes * 60 * 1000;
  const end = new Date(now.getTime() - bufferMs);
  const start = new Date(end.getTime() - lookbackMs);
  return { start, end };
}
