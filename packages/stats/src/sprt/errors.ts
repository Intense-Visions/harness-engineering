/**
 * Typed errors of the SPRT instrument. Two consumer bugs throw (spec "Error
 * handling"): an invalid config is rejected at construction, never degraded
 * through, and an observation outside {0, 1, true, false} is rejected by
 * `observe` rather than silently counted as a failure. A sibling of
 * `bandit/errors.ts` by design, not an import from it: each instrument is one
 * self-contained namespace (D6), so `stats.sprt` never reaches into `bandit/`
 * internals.
 */

/** Thrown by `validateSprtConfig` (and so by `createSprt`) when an `SprtConfig` fails validation. */
export class InvalidSprtConfigError extends Error {
  constructor(message: string) {
    super(`invalid SprtConfig: ${message}`);
    this.name = 'InvalidSprtConfigError';
  }
}

/**
 * Thrown by `Sprt.observe` when the value is not exactly `0`, `1`, `true`, or
 * `false`. Anything else (`0.5`, `2`, `'1'`, `null`, `undefined`, `NaN`) is a
 * consumer bug, not a failure: counting it would bias the test toward `accept`
 * with no signal. The state is left untouched.
 */
export class InvalidSprtObservationError extends Error {
  constructor(value: unknown) {
    super(
      `invalid SprtObservation: expected 0, 1, true, or false, got ${String(value)} (${typeof value})`
    );
    this.name = 'InvalidSprtObservationError';
  }
}
