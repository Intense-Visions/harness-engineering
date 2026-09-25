/**
 * Typed error of the SPRT instrument. Nothing on the observe path throws
 * (spec "Error handling"): an invalid config is rejected at construction,
 * never degraded through. A sibling of `bandit/errors.ts` by design, not an
 * import from it: each instrument is one self-contained namespace (D6), so
 * `stats.sprt` never reaches into `bandit/` internals.
 */

/** Thrown by `validateSprtConfig` (and so by `createSprt`) when an `SprtConfig` fails validation. */
export class InvalidSprtConfigError extends Error {
  constructor(message: string) {
    super(`invalid SprtConfig: ${message}`);
    this.name = 'InvalidSprtConfigError';
  }
}
