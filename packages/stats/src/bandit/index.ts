/**
 * Explore/exploit bandit — public surface of the instrument (spec D3, D7).
 *
 * Record pulls with `BanditLedger.append`, fold them into decayed `ArmState`s
 * with `BanditLedger.fold` (or `foldArms` over in-memory pulls), pick an arm
 * with `choose`, and bound the file with `BanditLedger.compact`. Sampling, line
 * parsing, and the retention predicate stay internal.
 */
export { decayWeight, foldArms } from './arm-model.js';
export {
  DEFAULT_HALF_LIFE_DAYS,
  DEFAULT_MIN_EFFECTIVE_N,
  DEFAULT_PRIOR,
  DEFAULT_RETENTION_HALF_LIVES,
  DEFAULT_SCOUT_FRACTION,
  resolveBanditConfig,
  type ResolvedBanditConfig,
} from './config.js';
export { InvalidBanditConfigError, NoEligibleArmsError } from './errors.js';
export {
  BanditLedger,
  DEFAULT_LEDGER_PATH,
  type BanditLedgerOptions,
  type CompactResult,
  type FoldResult,
} from './ledger.js';
export { choose } from './policy.js';
export type { Rng } from './sampling.js';
export {
  COST_EPSILON_USD,
  outcomeOnly,
  outcomePerDollar,
  type Reward,
  type Utility,
} from './utility.js';
