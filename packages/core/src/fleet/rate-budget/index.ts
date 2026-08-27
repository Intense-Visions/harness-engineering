// packages/core/src/fleet/rate-budget/index.ts
//
// Per-resource fan-out budget primitive (#1532): proactive per-resource rate
// limiting + shared backoff + fail-on-throttle/truncation errors.

export type { ResourceBudgetConfig } from './types';
export { RateBudget, sharedRateBudget, applyResourceBudgets } from './budget';
// Note: `RateBudget.reset()` is exposed as an instance method (test isolation).
export type { RateBudgetAcquireOptions } from './budget';
export { ThrottledFetchError, TruncatedFetchError } from './errors';
