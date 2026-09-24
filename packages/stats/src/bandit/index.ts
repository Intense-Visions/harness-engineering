/**
 * Explore/exploit bandit — public surface of the instrument (spec D3, D7).
 *
 * Record pulls with `BanditLedger.append`, fold them into decayed `ArmState`s
 * with `BanditLedger.fold` (or `foldArms` over in-memory pulls), and pick an
 * arm with `choose`. Sampling and line parsing stay internal.
 */
export { decayWeight, foldArms } from './arm-model.js';
export {
  DEFAULT_PRIOR,
  DEFAULT_SCOUT_FRACTION,
  resolveBanditConfig,
  type ResolvedBanditConfig,
} from './config.js';
export { InvalidBanditConfigError, NoEligibleArmsError } from './errors.js';
export {
  BanditLedger,
  DEFAULT_LEDGER_PATH,
  type BanditLedgerOptions,
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
