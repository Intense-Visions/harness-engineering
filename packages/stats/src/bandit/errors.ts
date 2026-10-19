/**
 * Typed errors of the bandit instrument. Nothing else on the hot path throws
 * (spec "Error handling"): an empty eligible set is a consumer bug (D7) and an
 * invalid config is rejected on every `choose()` / `fold()` via
 * `resolveBanditConfig` (the bandit has no constructor), never degraded through.
 */

/** Thrown by `choose` when `eligible` is empty. The consumer owns eligibility (D7). */
export class NoEligibleArmsError extends Error {
  constructor() {
    super('choose(): the eligible arm set is empty; pass at least one eligible arm (spec D7)');
    this.name = 'NoEligibleArmsError';
  }
}

/** Thrown by `resolveBanditConfig` when a `BanditConfig` fails validation. */
export class InvalidBanditConfigError extends Error {
  constructor(message: string) {
    super(`invalid BanditConfig: ${message}`);
    this.name = 'InvalidBanditConfigError';
  }
}
